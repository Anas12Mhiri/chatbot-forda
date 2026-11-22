"""Mathematical and API tests using only fictional doctor profiles."""

import unittest
import json
from pathlib import Path
from tempfile import TemporaryDirectory

import httpx

from app.doctor_repository import EmptyDoctorRepository, InMemoryDoctorRepository, JsonDoctorRepository
from app.main import create_app
from app.recommendation_engine import (
    CRITERIA,
    DoctorRecommendationEngine,
    InconsistentComparisonsError,
    RecommendationSettings,
    ahp_priority_vector,
    bayesian_review_score,
    canonical_specialty,
    experience_score,
    haversine_km,
    location_score,
    operations_score,
    taxonomy_relevance,
    tfidf_cosine_scores,
    topsis_rank,
)
from app.recommendation_schemas import DoctorProfile, Qualification, RecommendationRequest


def synthetic_doctors() -> list[DoctorProfile]:
    """Return ten fabricated test-only cardiology profiles with varied data."""
    names = ["Ada Test", "Benoit Test", "Camille Test", "Dalia Test", "Elias Test",
             "Farah Test", "Gabin Test", "Hana Test", "Idris Test", "Jules Test"]
    doctors = []
    for index, name in enumerate(names):
        doctors.append(
            DoctorProfile(
                doctor_id=f"fictional-{index + 1:02}",
                name=name,
                specialty="Cardiologie" if index % 2 else "cardiology",
                subspecialties=["heart rhythm"] if index % 3 == 0 else [],
                latitude=36.80 + index * 0.01,
                longitude=10.18 + index * 0.01,
                experience_years=index + 1,
                operations_count=index * 45,
                operation_specialties=["cardiologie"],
                average_rating=3.8 + index * 0.1,
                review_count=5 + index * 10,
                biography=(
                    "Cardiologue spécialisé en cardiologie et troubles du rythme cardiaque. "
                    "Consultations pour palpitations et suivi cardiovasculaire."
                    if index % 3 == 0
                    else "Cardiologue proposant des consultations de cardiologie générale."
                ),
                education=[
                    Qualification(
                        title="Diplôme spécialiste fictif",
                        specialty="cardiology",
                        level="specialist",
                        verified=True,
                    )
                ] if index % 2 == 0 else None,
            )
        )
    return doctors


def test_request(**updates) -> RecommendationRequest:
    values = {
        "patient_query": "Je cherche un cardiologue pour les troubles du rythme et palpitations",
        "specialty": "cardiologie",
        "latitude": 36.80,
        "longitude": 10.18,
    }
    values.update(updates)
    return RecommendationRequest(**values)


class MathematicalComponentTests(unittest.TestCase):
    def test_haversine_distance_and_coordinate_validation(self):
        self.assertAlmostEqual(haversine_km(0, 0, 0, 1), 111.19, delta=0.2)
        self.assertEqual(haversine_km(36.8, 10.18, 36.8, 10.18), 0)
        with self.assertRaises(ValueError):
            haversine_km(91, 0, 0, 0)

    def test_location_experience_and_operation_normalization(self):
        self.assertEqual(location_score(0), 1)
        self.assertGreater(location_score(2), location_score(20))
        self.assertAlmostEqual(location_score(10), 2.718281828 ** -1, places=5)
        self.assertEqual(experience_score(10), 0.5)
        self.assertEqual(experience_score(30), 1)
        self.assertEqual(operations_score(250), 0.5)
        self.assertEqual(operations_score(900), 1)

    def test_bayesian_average_shrinks_small_samples_toward_global_mean(self):
        small_sample = bayesian_review_score(5, 1, 4, confidence=20)
        large_sample = bayesian_review_score(5, 100, 4, confidence=20)
        self.assertGreater(large_sample, small_sample)
        self.assertLess(small_sample, 1)

    def test_tfidf_similarity_and_missing_biography(self):
        scores = tfidf_cosine_scores(
            "cardiology heart rhythm", ["heart rhythm cardiology", "dermatology skin", None]
        )
        self.assertGreater(scores[0], scores[1])
        self.assertIsNone(scores[2])

    def test_taxonomy_aliases_match_without_llm(self):
        self.assertEqual(canonical_specialty("Cardiologie", {"cardiology": ("cardiologie",)}), "cardiology")
        self.assertEqual(
            taxonomy_relevance("cardiologie et cardiologue", ["cardiology"]),
            1.0,
        )
        self.assertIsNone(taxonomy_relevance("consultation demandée", ["cardiology"]))

    def test_ahp_priority_vector_and_consistency(self):
        matrix = [[1.0] * 6 for _ in range(6)]
        priorities, eigenvalue, ci, cr = ahp_priority_vector(matrix)
        self.assertEqual(len(priorities), 6)
        self.assertAlmostEqual(sum(priorities), 1)
        self.assertAlmostEqual(priorities[0], 1 / 6)
        self.assertAlmostEqual(eigenvalue, 6)
        self.assertAlmostEqual(ci, 0)
        self.assertAlmostEqual(cr, 0)

    def test_ahp_rejects_inconsistent_pairwise_comparisons(self):
        matrix = [[1.0] * 3 for _ in range(3)]
        matrix[0][1], matrix[1][0] = 9, 1 / 9
        matrix[1][2], matrix[2][1] = 9, 1 / 9
        matrix[2][0], matrix[0][2] = 9, 1 / 9
        _, _, _, cr = ahp_priority_vector(matrix)
        self.assertGreaterEqual(cr, 0.1)
        with self.assertRaises(ValueError):
            ahp_priority_vector([[1, 2], [1, 1]])

    def test_topsis_ideals_and_closeness(self):
        matrix = [
            {"experience": 1.0, "reviews": 0.0},
            {"experience": 0.0, "reviews": 1.0},
            {"experience": 0.8, "reviews": 0.8},
        ]
        scores, positive, negative = topsis_rank(matrix, {"experience": 0.5, "reviews": 0.5})
        self.assertGreater(scores[2], scores[0])
        self.assertGreater(scores[2], scores[1])
        self.assertGreater(positive["experience"], negative["experience"])
        self.assertGreater(positive["reviews"], negative["reviews"])


class RecommendationPipelineTests(unittest.TestCase):
    def setUp(self):
        self.doctors = synthetic_doctors()
        self.engine = DoctorRecommendationEngine()

    def test_top_three_filter_and_repeatable_ranking(self):
        first = self.engine.recommend(test_request(count=3), self.doctors)
        second = self.engine.recommend(test_request(count=3), self.doctors)
        self.assertEqual(len(first.recommendations), 3)
        self.assertEqual(
            [item.doctor_id for item in first.recommendations],
            [item.doctor_id for item in second.recommendations],
        )
        self.assertEqual(first.algorithm.weights_source, "baseline")

    def test_specialty_mismatch_is_excluded_and_empty_catalog_is_explicit(self):
        only_other = [DoctorProfile(doctor_id="x", name="Test", specialty="Neurology")]
        no_match = self.engine.recommend(test_request(), only_other)
        self.assertEqual(no_match.status, "no_matches")
        self.assertEqual(no_match.recommendations, [])
        self.assertEqual(self.engine.recommend(test_request(), []).status, "no_matches")

    def test_subspecialty_request_requires_matching_parent_and_profile_tag(self):
        request = test_request(specialty="cardiac arrhythmia", latitude=None, longitude=None)
        matched = DoctorProfile(
            doctor_id="subspecialist",
            name="Fictional Subspecialist",
            specialty="cardiology",
            subspecialties=["heart rhythm"],
            experience_years=9,
            biography="Heart rhythm consultations and cardiac rhythm disorders.",
        )
        unmatched = DoctorProfile(
            doctor_id="general",
            name="Fictional General",
            specialty="cardiology",
            experience_years=15,
            biography="General cardiology consultations.",
        )
        result = self.engine.recommend(request, [matched, unmatched])
        self.assertEqual([item.doctor_id for item in result.recommendations], ["subspecialist"])
        self.assertEqual(result.unranked_profiles, [])

    def test_missing_location_removes_location_weight_and_discloses_it(self):
        result = self.engine.recommend(
            test_request(latitude=None, longitude=None), self.doctors[:2]
        )
        self.assertNotIn("location", result.algorithm.weights)
        self.assertIsNone(result.recommendations[0].distance_km)
        self.assertTrue(any("aucune position" in value for value in result.recommendations[0].missing_information))

    def test_missing_profile_fields_are_not_silently_scored_as_zero(self):
        sparse = DoctorProfile(
            doctor_id="sparse",
            name="Fictional Sparse",
            specialty="cardiology",
            experience_years=8,
            biography="Cardiologie générale et consultations cardiovasculaires.",
        )
        result = self.engine.recommend(test_request(latitude=None, longitude=None), [sparse])
        item = result.recommendations[0]
        self.assertIsNone(item.criteria_scores.operations)
        self.assertIsNone(item.criteria_scores.reviews)
        self.assertIsNone(item.criteria_scores.education)
        self.assertIn("avis patients (aucun avis exploitable)", item.missing_information)

    def test_operations_only_count_when_specialty_is_recorded(self):
        doctor = DoctorProfile(
            doctor_id="operations",
            name="Fictional Surgeon",
            specialty="cardiology",
            operations_count=400,
            experience_years=8,
            biography="Cardiologie générale et consultations cardiovasculaires.",
        )
        result = self.engine.recommend(test_request(latitude=None, longitude=None), [doctor])
        self.assertIsNone(result.recommendations[0].criteria_scores.operations)
        self.assertIsNone(result.recommendations[0].operations_count)

    def test_unreviewed_doctor_has_missing_review_score(self):
        doctor = DoctorProfile(
            doctor_id="new",
            name="Fictional New",
            specialty="cardiology",
            experience_years=4,
            biography="Cardiologie générale et consultations cardiovasculaires.",
        )
        result = self.engine.recommend(test_request(latitude=None, longitude=None), [doctor])
        self.assertIsNone(result.recommendations[0].criteria_scores.reviews)

    def test_equal_scores_have_deterministic_name_tie_break(self):
        shared = dict(
            specialty="cardiology",
            experience_years=10,
            biography="Cardiologie générale et consultations cardiovasculaires.",
        )
        doctors = [
            DoctorProfile(doctor_id="z", name="Zoe Fictional", **shared),
            DoctorProfile(doctor_id="a", name="Alice Fictional", **shared),
        ]
        result = self.engine.recommend(test_request(latitude=None, longitude=None), doctors)
        self.assertEqual([item.name for item in result.recommendations], ["Alice Fictional", "Zoe Fictional"])

    def test_ahp_mode_reports_weights_and_rejects_inconsistency(self):
        consistent = RecommendationSettings(
            weight_mode="ahp",
            pairwise_comparisons=[[1.0] * len(CRITERIA) for _ in CRITERIA],
        )
        result = DoctorRecommendationEngine(consistent).recommend(test_request(), self.doctors)
        self.assertEqual(result.algorithm.weights_source, "ahp")
        self.assertAlmostEqual(result.algorithm.consistency_ratio or 0, 0)
        self.assertAlmostEqual(result.algorithm.maximum_eigenvalue or 0, 6)
        self.assertAlmostEqual(result.algorithm.consistency_index or 0, 0)
        matrix = [[1.0] * len(CRITERIA) for _ in CRITERIA]
        matrix[0][1], matrix[1][0] = 9, 1 / 9
        matrix[1][2], matrix[2][1] = 9, 1 / 9
        matrix[2][0], matrix[0][2] = 9, 1 / 9
        with self.assertRaises(InconsistentComparisonsError):
            DoctorRecommendationEngine(
                RecommendationSettings(weight_mode="ahp", pairwise_comparisons=matrix)
            ).recommend(test_request(), self.doctors)

    def test_patient_preferences_are_normalized(self):
        result = self.engine.recommend(
            test_request(
                latitude=None,
                longitude=None,
                criterion_preferences={"experience": 3, "reviews": 1},
            ),
            self.doctors,
        )
        self.assertEqual(result.algorithm.weights_source, "patient_preferences")
        self.assertAlmostEqual(sum(result.algorithm.weights.values()), 1)
        self.assertAlmostEqual(result.algorithm.weights["experience"], 0.75)

    def test_profile_with_no_rankable_information_is_not_recommended(self):
        sparse = DoctorProfile(doctor_id="empty-profile", name="Fictional Empty", specialty="cardiology")
        result = self.engine.recommend(test_request(latitude=None, longitude=None), [sparse])
        self.assertEqual(result.status, "insufficient_information")
        self.assertEqual(result.recommendations, [])
        self.assertEqual(result.excluded_for_insufficient_information, 1)
        self.assertIn(
            "années d’expérience",
            result.unranked_profiles[0].missing_information,
        )

    def test_education_uses_verified_specialty_relevance(self):
        relevant = DoctorProfile(
            doctor_id="verified",
            name="Fictional Verified",
            specialty="cardiology",
            education=[Qualification(title="Specialist diploma", specialty="cardiology", level="specialist", verified=True)],
        )
        unverified = DoctorProfile(
            doctor_id="unverified",
            name="Fictional Unverified",
            specialty="cardiology",
            education=[Qualification(title="Specialist diploma", specialty="cardiology", level="specialist", verified=False)],
        )
        scores = self.engine._score_profiles(test_request(latitude=None, longitude=None), [relevant, unverified])
        self.assertEqual(scores[0]["education"], 1.0)
        self.assertIsNone(scores[1]["education"])

    def test_json_repository_reads_validated_catalog(self):
        with TemporaryDirectory() as directory:
            path = Path(directory) / "doctors.json"
            path.write_text(json.dumps([{"doctor_id": "fictional", "name": "Test", "specialty": "cardiology"}]), encoding="utf-8")
            self.assertEqual(JsonDoctorRepository(path).list_doctors()[0].doctor_id, "fictional")
            path.write_text("{}", encoding="utf-8")
            with self.assertRaises(ValueError):
                JsonDoctorRepository(path).list_doctors()


class RecommendationRouteTests(unittest.IsolatedAsyncioTestCase):
    async def test_endpoint_uses_injected_catalog_without_calling_ollama(self):
        class NeverCalledClassifier:
            async def classify(self, user_message, conversation=None):
                raise AssertionError("Recommendations must not use Ollama")

        app = create_app(
            doctor_repository=InMemoryDoctorRepository(synthetic_doctors()),
            intent_classifier=NeverCalledClassifier(),
        )
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post(
                "/doctors/recommendations",
                json={"patient_query": "troubles du rythme cardiologie", "specialty": "cardiologie"},
            )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "success")
        self.assertEqual(len(response.json()["recommendations"]), 3)
        self.assertEqual(response.json()["algorithm"]["weights_source"], "baseline")

    async def test_default_endpoint_does_not_invent_doctors(self):
        app = create_app(doctor_repository=EmptyDoctorRepository())
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post(
                "/doctors/recommendations",
                json={"patient_query": "cardiologie", "specialty": "cardiologie"},
            )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "no_matches")
        self.assertEqual(response.json()["recommendations"], [])

    async def test_endpoint_rejects_invalid_coordinates_and_inconsistent_ahp(self):
        app = create_app(doctor_repository=InMemoryDoctorRepository(self.doctors_for_route()))
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            bad_coordinates = await client.post(
                "/doctors/recommendations",
                json={"patient_query": "cardiologie", "specialty": "cardiology", "latitude": 91, "longitude": 0},
            )
        self.assertEqual(bad_coordinates.status_code, 422)

        matrix = [[1.0] * len(CRITERIA) for _ in CRITERIA]
        matrix[0][1], matrix[1][0] = 9, 1 / 9
        matrix[1][2], matrix[2][1] = 9, 1 / 9
        matrix[2][0], matrix[0][2] = 9, 1 / 9
        inconsistent_app = create_app(
            doctor_repository=InMemoryDoctorRepository(self.doctors_for_route()),
            recommendation_engine=DoctorRecommendationEngine(
                RecommendationSettings(weight_mode="ahp", pairwise_comparisons=matrix)
            ),
        )
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=inconsistent_app), base_url="http://test"
        ) as client:
            response = await client.post(
                "/doctors/recommendations",
                json={"patient_query": "cardiologie", "specialty": "cardiology"},
            )
        self.assertEqual(response.status_code, 422)
        self.assertIn("revise", response.json()["detail"])

    @staticmethod
    def doctors_for_route():
        return synthetic_doctors()


if __name__ == "__main__":
    unittest.main()
