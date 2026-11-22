"""HTTP API for doctor search and review-sentiment recommendations."""

import logging
import os
import secrets
from pathlib import Path

from fastapi import APIRouter, Header, HTTPException, Query, status

from app.doctor_repository import DoctorRepository
from app.doctor_repository import normalize_filter
from app.recommendation_schemas import (
    DoctorCatalogItem,
    DoctorCatalogResponse,
    ReviewRecommendationItem,
    ReviewRecommendationRequest,
    ReviewRecommendationResponse,
    ReviewScoreResponse,
    ReviewSubmission,
)
from app.sentiment_classifier import ReviewSentimentClassifier
from app.review_store import ReviewStats, SQLiteReviewStore

logger = logging.getLogger(__name__)


def build_recommendation_router(
    repository: DoctorRepository,
    sentiment_classifier: ReviewSentimentClassifier | None = None,
    review_store: SQLiteReviewStore | None = None,
) -> APIRouter:
    """Expose doctor filters and rank solely by classified review sentiment."""
    router = APIRouter(prefix="/doctors", tags=["doctor recommendations"])
    store = review_store or SQLiteReviewStore.from_environment()

    def read_catalog():
        try:
            return repository.list_doctors()
        except Exception as exc:
            logger.error("Doctor catalog read failed: type=%s", type(exc).__name__)
            raise HTTPException(status_code=503, detail="Le catalogue de médecins est indisponible.") from exc

    def matches(doctor, specialty: str | None, city: str | None) -> bool:
        if specialty:
            selected = normalize_filter(specialty)
            available = {normalize_filter(doctor.specialty), *(normalize_filter(value) for value in doctor.specialties)}
            if selected not in available:
                return False
        if city:
            selected_city = normalize_filter(city)
            available_cities = {normalize_filter(doctor.city), normalize_filter(doctor.governorate)}
            if selected_city not in available_cities:
                return False
        return True

    def catalog_item(doctor, stats) -> DoctorCatalogItem:
        return DoctorCatalogItem(
            doctor_id=doctor.doctor_id,
            name=doctor.name,
            specialty=doctor.specialty,
            clinic=doctor.clinic,
            address=doctor.address,
            city=doctor.city,
            governorate=doctor.governorate,
            phone=doctor.phone,
            email=doctor.email,
            experience_years=doctor.experience_years,
            experience_synthetic=doctor.experience_synthetic,
            review_count=stats.count,
            reviews_synthetic=doctor.reviews_synthetic and stats.count == 0,
            positive_reviews=stats.positive,
            neutral_reviews=stats.neutral,
            negative_reviews=stats.negative,
            recommendation_ratio=stats.ratio,
        )

    @router.get("/catalog", response_model=DoctorCatalogResponse)
    def list_doctors(
        specialty: str | None = Query(default=None, max_length=120),
        city: str | None = Query(default=None, max_length=120),
        query: str | None = Query(default=None, max_length=200),
    ) -> DoctorCatalogResponse:
        doctors = read_catalog()
        stats_by_doctor = store.get_all_stats()
        specialties = sorted({doctor.specialty for doctor in doctors if doctor.specialty})
        cities = sorted({value for doctor in doctors for value in (doctor.city, doctor.governorate) if value})
        filtered = [doctor for doctor in doctors if matches(doctor, specialty, city)]
        if query:
            term = normalize_filter(query)
            filtered = [doctor for doctor in filtered if term in normalize_filter(" ".join(filter(None, (
                doctor.name, doctor.specialty, doctor.city, doctor.governorate, doctor.address, doctor.clinic,
            ))))]
        items = [catalog_item(doctor, stats_by_doctor.get(doctor.doctor_id, ReviewStats())) for doctor in filtered]
        items.sort(key=lambda item: (-(item.recommendation_ratio if item.recommendation_ratio is not None else -1), item.doctor_id))
        return DoctorCatalogResponse(doctors=items, total=len(items), specialties=specialties, cities=cities)

    @router.post("/recommendations", response_model=ReviewRecommendationResponse)
    def recommend_doctors(request: ReviewRecommendationRequest) -> ReviewRecommendationResponse:
        """Rank eligible doctors only by the sentiment ratio from their reviews."""
        filtered = [doctor for doctor in read_catalog() if matches(doctor, request.specialty, request.city)]
        if not filtered:
            return ReviewRecommendationResponse(status="no_matches", recommendations=[], total=0)
        stats_by_doctor = store.get_all_stats()
        scored = []
        for doctor in filtered:
            stats = stats_by_doctor.get(doctor.doctor_id, ReviewStats())
            if stats.ratio is None:
                continue
            item = catalog_item(doctor, stats).model_dump()
            item["recommendation_ratio"] = stats.ratio
            scored.append(ReviewRecommendationItem.model_validate(item))
        scored.sort(key=lambda item: (-item.recommendation_ratio, item.doctor_id))
        if not scored:
            return ReviewRecommendationResponse(status="no_classified_reviews", recommendations=[], total=0)
        return ReviewRecommendationResponse(
            status="recommended",
            recommendations=scored[:request.count],
            total=len(scored),
        )

    @router.post("/{doctor_id}/reviews", response_model=ReviewScoreResponse, status_code=status.HTTP_201_CREATED)
    def submit_review(
        doctor_id: str,
        submission: ReviewSubmission,
        x_review_submission_token: str | None = Header(default=None),
    ) -> ReviewScoreResponse:
        """Classify, persist, and rescore a new review in one API operation."""
        expected_token = os.getenv("DOCTOR_REVIEW_SUBMISSION_TOKEN")
        if not expected_token:
            raise HTTPException(status_code=503, detail="La soumission d’avis n’est pas configurée.")
        if not x_review_submission_token or not secrets.compare_digest(x_review_submission_token, expected_token):
            raise HTTPException(status_code=401, detail="Authentification requise pour ajouter un avis.")
        if sentiment_classifier is None:
            raise HTTPException(status_code=503, detail="Le modèle de sentiment est indisponible.")
        doctor = next((item for item in read_catalog() if item.doctor_id == doctor_id), None)
        if doctor is None:
            raise HTTPException(status_code=404, detail="Médecin introuvable.")
        try:
            labels = sentiment_classifier.classify_many([submission.text])
            if len(labels) != 1 or labels[0] not in {"positif", "neutre", "négatif"}:
                raise RuntimeError("Le modèle a retourné un sentiment invalide.")
            model_version = Path(getattr(sentiment_classifier, "model_path", "tfidf_logreg_sentiment.joblib")).name
            review_id, stats = store.add_review(doctor_id, submission.text, labels[0], model_version)
        except Exception as exc:
            logger.error("Review classification or save failed: type=%s", type(exc).__name__)
            raise HTTPException(status_code=503, detail="L’avis n’a pas pu être analysé et enregistré.") from exc
        return ReviewScoreResponse(
            doctor_id=doctor_id,
            review_id=review_id,
            sentiment=labels[0],
            review_count=stats.count,
            positive_reviews=stats.positive,
            neutral_reviews=stats.neutral,
            negative_reviews=stats.negative,
            recommendation_ratio=stats.ratio,
            updated_at=stats.updated_at,
        )

    @router.get("/{doctor_id}/review-score", response_model=ReviewScoreResponse)
    def get_review_score(doctor_id: str) -> ReviewScoreResponse:
        doctor = next((item for item in read_catalog() if item.doctor_id == doctor_id), None)
        if doctor is None:
            raise HTTPException(status_code=404, detail="Médecin introuvable.")
        stats = store.get_stats(doctor_id)
        return ReviewScoreResponse(
            doctor_id=doctor_id,
            review_count=stats.count,
            positive_reviews=stats.positive,
            neutral_reviews=stats.neutral,
            negative_reviews=stats.negative,
            recommendation_ratio=stats.ratio,
            updated_at=stats.updated_at,
        )

    return router
