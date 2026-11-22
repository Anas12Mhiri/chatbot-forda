"""Deterministic, explainable doctor matching with AHP weights and TOPSIS ranking.

Scores describe profile fit to explicit search criteria, never medical quality or
predicted outcomes. Text matching uses a small standard-library TF-IDF routine;
no language model or external service is called by this module.
"""

from __future__ import annotations

import math
import re
import unicodedata
from collections import Counter
from dataclasses import dataclass, field
from statistics import median
from typing import Literal, Mapping, Sequence

from app.recommendation_schemas import (
    Criterion,
    CriterionScores,
    DoctorProfile,
    DoctorRecommendation,
    RecommendationAlgorithm,
    RecommendationRequest,
    RecommendationResponse,
    UnrankedDoctorProfile,
)

CRITERIA: tuple[Criterion, ...] = (
    "location",
    "experience",
    "operations",
    "reviews",
    "biography",
    "education",
)
BASELINE_WEIGHTS: dict[Criterion, float] = {
    "location": 0.15,
    "experience": 0.20,
    "operations": 0.10,
    "reviews": 0.25,
    "biography": 0.20,
    "education": 0.10,
}
RANDOM_INDEX: dict[int, float] = {
    1: 0.0,
    2: 0.0,
    3: 0.58,
    4: 0.90,
    5: 1.12,
    6: 1.24,
    7: 1.32,
    8: 1.41,
    9: 1.45,
    10: 1.49,
}

# Starter specialty aliases and a few structured sub-specialty concepts;
# deployments should inject a maintained taxonomy appropriate to their catalog.
# These entries are matching aids only, not clinical guidance.
DEFAULT_SPECIALTY_TAXONOMY: dict[str, tuple[str, ...]] = {
    "cardiology": ("cardiology", "cardiologie", "cardiologue", "heart specialist"),
    "cardiac rhythm disorders": (
        "cardiac rhythm disorders", "cardiac arrhythmia", "arrhythmia", "arythmie",
        "troubles du rythme", "trouble du rythme", "heart rhythm",
    ),
    "cardiovascular prevention": (
        "cardiovascular prevention", "prévention cardiovasculaire", "prevention cardiovasculaire",
    ),
    "dermatology": ("dermatology", "dermatologie", "dermatologue", "skin specialist"),
    "eczema": ("eczema", "eczéma"),
    "acne": ("acne", "acné"),
    "neurology": ("neurology", "neurologie", "neurologue", "brain and nerve specialist"),
    "pediatrics": ("pediatrics", "paediatrics", "pédiatrie", "pediatre", "pédiatre"),
    "general practice": (
        "general practice", "médecine générale", "medecine generale", "general practitioner", "médecin généraliste",
    ),
    "orthopedics": ("orthopedics", "orthopaedics", "orthopédie", "orthopediste", "orthopédiste"),
    "gynecology": ("gynecology", "gynaecology", "gynécologie", "gynecologue", "gynécologue"),
}
DEFAULT_TAXONOMY_PARENTS: dict[str, str] = {
    "cardiac rhythm disorders": "cardiology",
    "cardiovascular prevention": "cardiology",
    "eczema": "dermatology",
    "acne": "dermatology",
}

FRENCH_ENGLISH_STOP_WORDS = frozenset(
    "a au aux avec ce ces dans de des du elle en et eux il ils je la le les leur lui ma mais me meme mes moi mon ne nos notre nous on ou par pas pour qu que quelle quelles quels qui sa sans se ses son sont sous sur ta te tes toi ton tous tout un une vos votre vous was were the a an and are as at be by for from has have he her hers him his i in is it its me my of on or our ours she so that their them then there they this those to was what when where which who will with you your about after again all any because before being between both but cannot could did do does doing during each few further had how into more most no nor not only other over own same should some such than too very can may should would".split()
)


@dataclass(frozen=True)
class RecommendationSettings:
    """Configurable weight source and normalization/scoring parameters."""

    weight_mode: Literal["baseline", "ahp"] = "baseline"
    baseline_weights: Mapping[Criterion, float] = field(default_factory=lambda: dict(BASELINE_WEIGHTS))
    pairwise_comparisons: Sequence[Sequence[float]] | None = None
    distance_scale_km: float = 10.0
    experience_cap_years: float = 20.0
    operations_cap: float = 500.0
    review_confidence: float = 20.0
    minimum_scored_criteria: int = 2
    taxonomy_alpha: float = 0.5
    tfidf_beta: float = 0.5
    education_level_scores: Mapping[str, float] = field(
        default_factory=lambda: {"specialist": 1.0, "postgraduate": 0.75, "certification": 0.5, "general": 0.25}
    )
    taxonomy: Mapping[str, Sequence[str]] = field(default_factory=lambda: dict(DEFAULT_SPECIALTY_TAXONOMY))
    taxonomy_parents: Mapping[str, str] = field(default_factory=lambda: dict(DEFAULT_TAXONOMY_PARENTS))
    consistency_threshold: float = 0.10

    def __post_init__(self) -> None:
        weights = dict(self.baseline_weights)
        if set(weights) != set(CRITERIA) or any(value < 0 for value in weights.values()):
            raise ValueError("Baseline weights must specify all six nonnegative criteria")
        if not math.isclose(sum(weights.values()), 1.0, abs_tol=1e-8):
            raise ValueError("Baseline weights must sum to 1")
        numeric_parameters = (
            self.distance_scale_km,
            self.experience_cap_years,
            self.operations_cap,
            self.review_confidence,
            self.taxonomy_alpha,
            self.tfidf_beta,
            self.consistency_threshold,
            *weights.values(),
        )
        if not all(math.isfinite(value) for value in numeric_parameters):
            raise ValueError("Recommendation parameters and weights must be finite")
        if min(self.distance_scale_km, self.experience_cap_years, self.operations_cap, self.review_confidence) <= 0:
            raise ValueError("Normalization parameters must be positive")
        if self.taxonomy_alpha < 0 or self.tfidf_beta < 0 or not math.isclose(
            self.taxonomy_alpha + self.tfidf_beta, 1.0, abs_tol=1e-8
        ):
            raise ValueError("Taxonomy and TF-IDF weights must be nonnegative and sum to 1")
        if not 0 < self.consistency_threshold <= 1:
            raise ValueError("The AHP consistency threshold must be between 0 and 1")
        if not 1 <= self.minimum_scored_criteria <= len(CRITERIA):
            raise ValueError("The minimum scored criteria must be between 1 and 6")
        expected_levels = {"specialist", "postgraduate", "certification", "general"}
        if set(self.education_level_scores) != expected_levels or any(
            not math.isfinite(value) or not 0 <= value <= 1
            for value in self.education_level_scores.values()
        ):
            raise ValueError("Education level scores must define all levels with values in [0, 1]")
        if self.weight_mode == "ahp" and self.pairwise_comparisons is None:
            raise ValueError("AHP mode requires pairwise comparison values")


class InconsistentComparisonsError(ValueError):
    """Raised when AHP pairwise judgments exceed the configured CR threshold."""

    def __init__(self, consistency_ratio: float) -> None:
        super().__init__(
            f"AHP comparisons are inconsistent (CR={consistency_ratio:.3f}); revise the pairwise comparisons."
        )
        self.consistency_ratio = consistency_ratio


def ahp_priority_vector(
    matrix: Sequence[Sequence[float]],
) -> tuple[list[float], float, float, float]:
    """Return normalized priorities, lambda-max, CI and CR via power iteration.

    Saaty's usual verbal scale maps equal importance to 1 and increasing
    preference to 2..9; reciprocal values 1/2..1/9 express the reverse.
    Entries must be positive, reciprocal, and within [1/9, 9].
    """
    size = len(matrix)
    if not 1 <= size <= 10 or any(len(row) != size for row in matrix):
        raise ValueError("AHP comparison matrix must be square with size 1 through 10")
    values = [[float(value) for value in row] for row in matrix]
    for i in range(size):
        for j in range(size):
            value = values[i][j]
            if not math.isfinite(value) or not (1 / 9 <= value <= 9):
                raise ValueError("AHP values must be finite and between 1/9 and 9")
        if not math.isclose(values[i][i], 1.0, abs_tol=1e-8):
            raise ValueError("AHP comparison matrix diagonal values must equal 1")
        for j in range(i + 1, size):
            if not math.isclose(values[i][j] * values[j][i], 1.0, rel_tol=1e-6, abs_tol=1e-8):
                raise ValueError("AHP comparison matrix must be reciprocal")

    vector = [1.0 / size] * size
    for _ in range(1000):
        product = [sum(values[i][j] * vector[j] for j in range(size)) for i in range(size)]
        total = sum(product)
        updated = [value / total for value in product]
        if max(abs(a - b) for a, b in zip(updated, vector)) < 1e-13:
            vector = updated
            break
        vector = updated
    matrix_vector = [sum(values[i][j] * vector[j] for j in range(size)) for i in range(size)]
    lambda_max = sum(value / weight for value, weight in zip(matrix_vector, vector)) / size
    consistency_index = max(0.0, (lambda_max - size) / (size - 1)) if size > 1 else 0.0
    random_index = RANDOM_INDEX.get(size)
    if random_index is None:
        raise ValueError("A consistency reference is only defined for matrices up to size 10")
    consistency_ratio = consistency_index / random_index if random_index else 0.0
    return vector, lambda_max, consistency_index, consistency_ratio


def haversine_km(latitude_a: float, longitude_a: float, latitude_b: float, longitude_b: float) -> float:
    """Calculate great-circle distance in km with a 6371 km earth radius."""
    coordinates = (latitude_a, longitude_a, latitude_b, longitude_b)
    if not all(math.isfinite(value) for value in coordinates):
        raise ValueError("Coordinates must be finite")
    if not (-90 <= latitude_a <= 90 and -90 <= latitude_b <= 90):
        raise ValueError("Latitude must be between -90 and 90")
    if not (-180 <= longitude_a <= 180 and -180 <= longitude_b <= 180):
        raise ValueError("Longitude must be between -180 and 180")
    lat_a, lat_b = math.radians(latitude_a), math.radians(latitude_b)
    delta_lat = lat_b - lat_a
    delta_lon = math.radians(longitude_b - longitude_a)
    hav = math.sin(delta_lat / 2) ** 2 + math.cos(lat_a) * math.cos(lat_b) * math.sin(delta_lon / 2) ** 2
    return 6371.0 * 2 * math.asin(math.sqrt(min(1.0, hav)))


def location_score(distance_km: float, scale_km: float = 10.0) -> float:
    """Convert distance to benefit score exp(-distance / scale)."""
    if distance_km < 0 or not math.isfinite(distance_km) or scale_km <= 0:
        raise ValueError("Distance must be finite and nonnegative; scale must be positive")
    return math.exp(-distance_km / scale_km)


def experience_score(years: int, cap_years: float = 20.0) -> float:
    """Cap experience normalization at the configured number of years."""
    if years < 0 or cap_years <= 0:
        raise ValueError("Experience and cap must be nonnegative and positive respectively")
    return min(years / cap_years, 1.0)


def operations_score(count: int, cap: float = 500.0) -> float:
    """Cap relevant operation counts at the configured reference count."""
    if count < 0 or cap <= 0:
        raise ValueError("Operation count and cap must be nonnegative and positive respectively")
    return min(count / cap, 1.0)


def bayesian_review_score(average_rating: float, count: int, global_average: float, confidence: float = 20.0) -> float:
    """Return Bayesian average normalized from the 0..5 rating scale to 0..1."""
    if count <= 0 or not 0 <= average_rating <= 5 or not 0 <= global_average <= 5 or confidence <= 0:
        raise ValueError("Bayesian reviews require valid 0..5 ratings, positive count and confidence")
    posterior = (count * average_rating + confidence * global_average) / (count + confidence)
    return posterior / 5.0


def normalize_text(text: str) -> str:
    """Lowercase and remove diacritics for consistent French/English matching."""
    decomposed = unicodedata.normalize("NFKD", text.casefold())
    return "".join(ch for ch in decomposed if not unicodedata.combining(ch))


def tokenize(text: str) -> list[str]:
    """Tokenize French/English text and remove common function words."""
    words = re.findall(r"[a-z0-9]+", normalize_text(text))
    return [word for word in words if len(word) > 1 and word not in FRENCH_ENGLISH_STOP_WORDS]


def tfidf_cosine_scores(query: str, documents: Sequence[str | None]) -> list[float | None]:
    """Calculate query-document cosine similarity using smoothed TF-IDF."""
    query_tokens = tokenize(query)
    token_docs = [tokenize(document or "") for document in documents]
    active_indices = [i for i, document in enumerate(documents) if document and document.strip()]
    output: list[float | None] = [None] * len(documents)
    if not query_tokens or not active_indices:
        return output
    corpus = [query_tokens] + [token_docs[i] for i in active_indices]
    doc_frequency: Counter[str] = Counter()
    for tokens in corpus:
        doc_frequency.update(set(tokens))
    document_count = len(corpus)

    def vector(tokens: list[str]) -> dict[str, float]:
        counts = Counter(tokens)
        length = max(1, len(tokens))
        return {
            token: counts[token] / length * (math.log((document_count + 1) / (doc_frequency[token] + 1)) + 1)
            for token in counts
        }

    query_vector = vector(query_tokens)
    query_norm = math.sqrt(sum(value * value for value in query_vector.values()))
    if query_norm == 0:
        return output
    for index in active_indices:
        doc_vector = vector(token_docs[index])
        doc_norm = math.sqrt(sum(value * value for value in doc_vector.values()))
        if doc_norm == 0:
            output[index] = 0.0
            continue
        dot_product = sum(weight * doc_vector.get(token, 0.0) for token, weight in query_vector.items())
        output[index] = min(1.0, max(0.0, dot_product / (query_norm * doc_norm)))
    return output


def canonical_specialty(value: str, taxonomy: Mapping[str, Sequence[str]]) -> str:
    """Map an exact specialty label or configured synonym to its canonical key."""
    normalized = normalize_text(value).strip()
    for canonical, synonyms in taxonomy.items():
        if normalized == normalize_text(canonical) or any(normalized == normalize_text(item) for item in synonyms):
            return normalize_text(canonical)
    return normalized


def _taxonomy_concepts(text: str, taxonomy: Mapping[str, Sequence[str]]) -> set[str]:
    normalized_text = re.sub(r"[^a-z0-9]+", " ", normalize_text(text)).strip()
    normalized = f" {normalized_text} "
    concepts: set[str] = set()
    for canonical, synonyms in taxonomy.items():
        labels = (canonical, *synonyms)
        for label in labels:
            normalized_label = normalize_text(label).strip()
            if normalized_label and f" {normalized_label} " in normalized:
                concepts.add(normalize_text(canonical))
                break
    return concepts


def taxonomy_relevance(
    query: str,
    doctor_terms: Sequence[str],
    taxonomy: Mapping[str, Sequence[str]] = DEFAULT_SPECIALTY_TAXONOMY,
    excluded_concepts: set[str] | None = None,
) -> float | None:
    """Score overlap of explicitly named configured specialties/concepts."""
    query_concepts = _taxonomy_concepts(query, taxonomy) - (excluded_concepts or set())
    if not query_concepts:
        return None
    profile_concepts: set[str] = set()
    for term in doctor_terms:
        profile_concepts.update(_taxonomy_concepts(term, taxonomy))
    if not profile_concepts:
        return 0.0
    return len(query_concepts & profile_concepts) / len(query_concepts)


def topsis_rank(
    matrix: Sequence[Mapping[Criterion, float | None]],
    weights: Mapping[Criterion, float],
) -> tuple[list[float], dict[Criterion, float], dict[Criterion, float]]:
    """Rank rows by TOPSIS after vector normalization and neutral median imputation.

    All inputs are benefit-oriented normalized scores. A missing per-doctor value
    is imputed at the observed column median (neutral) and separately disclosed.
    """
    if not matrix:
        return [], {}, {}
    active = [criterion for criterion, weight in weights.items() if weight > 0 and any(row.get(criterion) is not None for row in matrix)]
    if not active:
        return [0.5] * len(matrix), {}, {}
    weight_total = sum(weights[criterion] for criterion in active)
    normalized_weights = {criterion: weights[criterion] / weight_total for criterion in active}
    weighted_columns: dict[Criterion, list[float]] = {}
    positive_ideal: dict[Criterion, float] = {}
    negative_ideal: dict[Criterion, float] = {}
    for criterion in active:
        values = [float(row[criterion]) for row in matrix if row.get(criterion) is not None]
        imputation = median(values)
        complete = [float(row[criterion]) if row.get(criterion) is not None else imputation for row in matrix]
        norm = math.sqrt(sum(value * value for value in complete))
        if norm == 0:
            normalized = [0.0] * len(complete)
        else:
            normalized = [value / norm * normalized_weights[criterion] for value in complete]
        weighted_columns[criterion] = normalized
        positive_ideal[criterion] = max(normalized)
        negative_ideal[criterion] = min(normalized)
    scores: list[float] = []
    for index in range(len(matrix)):
        distance_positive = math.sqrt(sum((weighted_columns[c][index] - positive_ideal[c]) ** 2 for c in active))
        distance_negative = math.sqrt(sum((weighted_columns[c][index] - negative_ideal[c]) ** 2 for c in active))
        denominator = distance_positive + distance_negative
        scores.append(distance_negative / denominator if denominator else 0.5)
    return scores, positive_ideal, negative_ideal


class DoctorRecommendationEngine:
    """Filter and rank profiles without an LLM or external inference service."""

    def __init__(self, settings: RecommendationSettings | None = None) -> None:
        self.settings = settings or RecommendationSettings()

    def recommend(
        self,
        request: RecommendationRequest,
        doctors: Sequence[DoctorProfile],
    ) -> RecommendationResponse:
        """Return up to the requested number of eligible, explainable matches."""
        taxonomy = self.settings.taxonomy
        wanted = canonical_specialty(request.specialty, taxonomy)
        eligible: list[DoctorProfile] = []
        for doctor in doctors:
            doctor_specialties = {
                canonical_specialty(value, taxonomy)
                for value in [doctor.specialty, *doctor.specialties]
            }
            doctor_subspecialties = {
                canonical_specialty(value, taxonomy) for value in doctor.subspecialties
            }
            requested_parent = self.settings.taxonomy_parents.get(wanted)
            if wanted in doctor_specialties or (
                requested_parent in doctor_specialties and wanted in doctor_subspecialties
            ):
                eligible.append(doctor)
        base_weights, source, cr, lambda_max, ci = self._configured_weights()
        criterion_scores = self._score_profiles(request, eligible)
        available = [criterion for criterion in CRITERIA if any(row[criterion] is not None for row in criterion_scores)]
        if request.criterion_preferences is not None:
            preferred = {criterion: request.criterion_preferences.get(criterion, 0.0) for criterion in available}
            if sum(preferred.values()) <= 0 and available:
                raise ValueError("Preferences must assign positive weight to at least one available criterion")
            weights = preferred
            source = "patient_preferences"
        else:
            weights = {criterion: base_weights[criterion] for criterion in available}
        rankable = [
            index for index, row in enumerate(criterion_scores)
            if sum(
                row[criterion] is not None and weights.get(criterion, 0) > 0
                for criterion in CRITERIA
            ) >= self.settings.minimum_scored_criteria
        ]
        unavailable_count = len(eligible) - len(rankable)
        if not rankable:
            algorithm = RecommendationAlgorithm(
                weights_source=source,
                weights={},
                consistency_ratio=cr,
                maximum_eigenvalue=lambda_max,
                consistency_index=ci,
                note=(
                    "Le score mesure l’adéquation du profil aux critères fournis; il ne prouve "
                    "pas une supériorité médicale ni un résultat clinique et ne remplace pas "
                    "un avis médical. En cas d’urgence présumée, contactez les services d’urgence locaux."
                    if not eligible
                    else "Les profils correspondent à la spécialité, mais les informations disponibles "
                    "ne suffisent pas pour établir un classement fiable."
                ),
            )
            return RecommendationResponse(
                status="insufficient_information" if eligible else "no_matches",
                recommendations=[],
                unranked_profiles=[
                    UnrankedDoctorProfile(
                        doctor_id=doctor.doctor_id,
                        name=doctor.name,
                        specialty=doctor.specialty,
                        missing_information=self._missing_information(request, doctor),
                    )
                    for doctor in sorted(eligible, key=lambda item: (normalize_text(item.name), item.doctor_id))
                ],
                algorithm=algorithm,
                excluded_for_insufficient_information=unavailable_count,
                message=(
                    "Aucune correspondance de spécialité n’a été trouvée."
                    if not eligible
                    else "Les profils trouvés ne contiennent pas assez d’informations exploitables pour être classés."
                ),
            )
        rankable = [
            index for index in rankable
            if any(criterion_scores[index][criterion] is not None and weights.get(criterion, 0) > 0 for criterion in CRITERIA)
        ]
        available_rankable = [
            criterion for criterion in available
            if any(criterion_scores[index][criterion] is not None for index in rankable)
        ]
        weights = {
            criterion: weights[criterion]
            for criterion in available_rankable
            if weights.get(criterion, 0) > 0
        }
        weight_total = sum(weights.values())
        if weight_total:
            weights = {criterion: value / weight_total for criterion, value in weights.items() if value > 0}
        ranked_matrix = [criterion_scores[index] for index in rankable]
        score_values, _, _ = topsis_rank(ranked_matrix, weights)
        ranked_recommendations = [
            (
                self._build_recommendation(request, eligible[doctor_index], ranked_matrix[index], score_values[index]),
                score_values[index],
            )
            for index, doctor_index in enumerate(rankable)
        ]
        ranked_recommendations.sort(
            key=lambda pair: (-pair[1], normalize_text(pair[0].name), pair[0].doctor_id)
        )
        recommendations = [item for item, _ in ranked_recommendations]
        algorithm = RecommendationAlgorithm(
            weights_source=source,
            weights=weights,
            consistency_ratio=cr,
            maximum_eigenvalue=lambda_max,
            consistency_index=ci,
        )
        return RecommendationResponse(
            status="success" if recommendations else "no_matches",
            recommendations=recommendations[: request.count],
            unranked_profiles=[
                UnrankedDoctorProfile(
                    doctor_id=eligible[index].doctor_id,
                    name=eligible[index].name,
                    specialty=eligible[index].specialty,
                    missing_information=self._missing_information(request, eligible[index]),
                )
                for index in sorted(
                    (position for position in range(len(eligible)) if position not in rankable),
                    key=lambda position: (normalize_text(eligible[position].name), eligible[position].doctor_id),
                )
            ],
            algorithm=algorithm,
            excluded_for_insufficient_information=unavailable_count,
            message=(
                f"{unavailable_count} profil(s) écarté(s), faute d’informations suffisantes pour les classer."
                if unavailable_count else None
            ),
        )

    def _configured_weights(
        self,
    ) -> tuple[dict[Criterion, float], Literal["baseline", "ahp"], float | None, float | None, float | None]:
        if self.settings.weight_mode == "baseline":
            return dict(self.settings.baseline_weights), "baseline", None, None, None
        assert self.settings.pairwise_comparisons is not None
        priorities, lambda_max, ci, cr = ahp_priority_vector(self.settings.pairwise_comparisons)
        if len(priorities) != len(CRITERIA):
            raise ValueError("The AHP matrix must match the six configured criteria in the documented order")
        if cr >= self.settings.consistency_threshold:
            raise InconsistentComparisonsError(cr)
        return dict(zip(CRITERIA, priorities)), "ahp", cr, lambda_max, ci

    def _score_profiles(
        self,
        request: RecommendationRequest,
        doctors: Sequence[DoctorProfile],
    ) -> list[dict[Criterion, float | None]]:
        global_ratings = [
            (doctor.average_rating, doctor.review_count) for doctor in doctors
            if doctor.review_count > 0 and doctor.average_rating is not None
        ]
        global_ratings.sort()
        total_reviews = sum(count for _, count in global_ratings)
        global_average = (
            sum(rating * count for rating, count in global_ratings) / total_reviews
            if total_reviews else None
        )
        biography_scores = tfidf_cosine_scores(request.patient_query, [doctor.biography for doctor in doctors])
        wanted = canonical_specialty(request.specialty, self.settings.taxonomy)
        scores: list[dict[Criterion, float | None]] = []
        for index, doctor in enumerate(doctors):
            distance: float | None = None
            location: float | None = None
            if request.latitude is not None and doctor.latitude is not None and doctor.longitude is not None:
                distance = haversine_km(request.latitude, request.longitude, doctor.latitude, doctor.longitude)
                location = location_score(distance, self.settings.distance_scale_km)
            operations: float | None = None
            if doctor.operations_count is not None and doctor.operation_specialties is not None:
                operation_keys = {
                    canonical_specialty(value, self.settings.taxonomy)
                    for value in doctor.operation_specialties
                }
                if any(self._belongs_to_specialty(value, wanted) for value in operation_keys):
                    operations = operations_score(doctor.operations_count, self.settings.operations_cap)
            reviews = None
            if doctor.review_count > 0 and doctor.average_rating is not None and global_average is not None:
                reviews = bayesian_review_score(
                    doctor.average_rating,
                    doctor.review_count,
                    global_average,
                    self.settings.review_confidence,
                )
            specialty_terms = [doctor.specialty, *doctor.specialties, *doctor.subspecialties]
            taxonomy_value = taxonomy_relevance(
                request.patient_query,
                specialty_terms,
                self.settings.taxonomy,
                excluded_concepts={wanted},
            )
            bio_value = biography_scores[index]
            relevance_parts: list[tuple[float, float]] = []
            if taxonomy_value is not None:
                relevance_parts.append((taxonomy_value, self.settings.taxonomy_alpha))
            if bio_value is not None:
                relevance_parts.append((bio_value, self.settings.tfidf_beta))
            if relevance_parts:
                relevance_weight = sum(weight for _, weight in relevance_parts)
                biography_relevance = sum(value * weight for value, weight in relevance_parts) / relevance_weight
            else:
                biography_relevance = None
            verified_qualifications = [item for item in (doctor.education or []) if item.verified]
            matching_qualifications = [
                item for item in verified_qualifications
                if item.specialty and self._belongs_to_specialty(
                    canonical_specialty(item.specialty, self.settings.taxonomy), wanted
                )
            ]
            education_value: float | None
            if doctor.education is None or not verified_qualifications:
                education_value = None
            else:
                education_value = max(
                    (self.settings.education_level_scores[item.level] for item in matching_qualifications),
                    default=0.0,
                )
            scores.append(
                {
                    "location": location if request.latitude is not None else None,
                    "experience": experience_score(doctor.experience_years, self.settings.experience_cap_years)
                    if doctor.experience_years is not None else None,
                    "operations": operations,
                    "reviews": reviews,
                    "biography": biography_relevance,
                    "education": education_value,
                }
            )
        return scores

    def _belongs_to_specialty(self, concept: str, requested: str) -> bool:
        """Match a specialty itself or an explicitly configured sub-specialty."""
        return concept == requested or self.settings.taxonomy_parents.get(concept) == requested

    def _missing_information(self, request: RecommendationRequest, doctor: DoctorProfile) -> list[str]:
        """List unavailable source fields without converting them to zero scores."""
        missing: list[str] = []
        if request.latitude is None:
            missing.append("distance (aucune position fournie par le patient)")
        elif doctor.latitude is None:
            missing.append("coordonnées du médecin")
        if doctor.experience_years is None:
            missing.append("années d’expérience")
        wanted = canonical_specialty(request.specialty, self.settings.taxonomy)
        operation_relevant = bool(
            doctor.operation_specialties
            and any(
                self._belongs_to_specialty(canonical_specialty(value, self.settings.taxonomy), wanted)
                for value in doctor.operation_specialties
            )
        )
        if doctor.operations_count is None or not operation_relevant:
            missing.append("nombre d’interventions pertinentes pour cette spécialité")
        if doctor.review_count == 0 or doctor.average_rating is None:
            missing.append("avis patients (aucun avis exploitable)")
        if doctor.biography is None or not doctor.biography.strip():
            missing.append("biographie (pertinence textuelle indisponible)")
        if not any(item.verified for item in (doctor.education or [])):
            missing.append("formations vérifiées")
        return missing

    def _build_recommendation(
        self,
        request: RecommendationRequest,
        doctor: DoctorProfile,
        scores: Mapping[Criterion, float | None],
        topsis_score: float,
    ) -> DoctorRecommendation:
        """Create factual explanation text from profile fields and scores."""
        missing: list[str] = []
        explanations: list[str] = []
        wanted = canonical_specialty(request.specialty, self.settings.taxonomy)
        profile_specialties = {
            canonical_specialty(value, self.settings.taxonomy)
            for value in [doctor.specialty, *doctor.specialties]
        }
        if wanted in profile_specialties:
            explanations.append(f"Spécialité déclarée correspondante : {doctor.specialty}.")
        else:
            matched_subspecialties = [
                value for value in doctor.subspecialties
                if canonical_specialty(value, self.settings.taxonomy) == wanted
            ]
            explanations.append(
                f"Sous-spécialité déclarée correspondant à la demande : {', '.join(matched_subspecialties)}."
            )
        distance = None
        if request.latitude is None:
            missing.append("distance (aucune position fournie par le patient)")
        elif doctor.latitude is None:
            missing.append("coordonnées du médecin")
        else:
            distance = haversine_km(request.latitude, request.longitude, doctor.latitude, doctor.longitude)  # type: ignore[arg-type]
            explanations.append(f"À environ {distance:.1f} km de la position indiquée.")
        if doctor.experience_years is None:
            missing.append("années d’expérience")
        else:
            explanations.append(f"{doctor.experience_years} année(s) d’expérience enregistrée(s).")
        operation_relevant = bool(
            doctor.operation_specialties
            and any(
                self._belongs_to_specialty(canonical_specialty(value, self.settings.taxonomy), wanted)
                for value in doctor.operation_specialties
            )
        )
        if doctor.operations_count is None or not operation_relevant:
            missing.append("nombre d’interventions pertinentes pour cette spécialité")
        else:
            explanations.append(f"{doctor.operations_count} intervention(s) enregistrée(s) dans cette spécialité.")
        if doctor.review_count == 0 or doctor.average_rating is None:
            missing.append("avis patients (aucun avis exploitable)")
        else:
            explanations.append(
                f"Note moyenne affichée : {doctor.average_rating:.1f}/5 sur {doctor.review_count} avis; "
                "le score utilise une moyenne bayésienne pour tenir compte du nombre d’avis."
            )
        if doctor.biography is None or not doctor.biography.strip():
            missing.append("biographie (pertinence textuelle indisponible)")
        elif scores["biography"] is not None:
            explanations.append(f"Pertinence du profil au texte demandé : {scores['biography']:.0%}.")
        verified = [item for item in (doctor.education or []) if item.verified]
        if not verified:
            missing.append("formations vérifiées")
        else:
            matched = [
                item.title for item in verified
                if item.specialty and self._belongs_to_specialty(
                    canonical_specialty(item.specialty, self.settings.taxonomy), wanted
                )
            ]
            if matched:
                explanations.append("Qualification(s) pertinente(s) vérifiée(s) : " + ", ".join(matched) + ".")
            else:
                explanations.append("Aucune formation vérifiée liée à cette spécialité n’a été identifiée dans le profil.")
        explanations.append("Correspondance de profil calculée avec des critères configurés; ce score n’est pas un avis médical.")
        return DoctorRecommendation(
            doctor_id=doctor.doctor_id,
            name=doctor.name,
            specialty=doctor.specialty,
            phone=doctor.phone,
            email=doctor.email,
            address=doctor.address,
            distance_km=round(distance, 2) if distance is not None else None,
            experience_years=doctor.experience_years,
            operations_count=doctor.operations_count if scores["operations"] is not None else None,
            average_rating=doctor.average_rating if doctor.review_count > 0 else None,
            review_count=doctor.review_count,
            topsis_score=round(topsis_score, 6),
            criteria_scores=CriterionScores(**scores),
            missing_information=missing,
            explanation=explanations,
        )
