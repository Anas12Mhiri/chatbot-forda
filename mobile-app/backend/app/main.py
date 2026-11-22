"""FastAPI application for patient symptom care navigation."""

from fastapi import FastAPI

from app.doctor_repository import DoctorRepository, JsonDoctorRepository
from app.intent import IntentClassifier
from app.llm import QuestionRefiner
from app.recommendation_engine import DoctorRecommendationEngine, RecommendationSettings
from app.recommendation_routes import build_recommendation_router
from app.routes import build_router
from app.triage import ConservativeDefaultPolicy, TriagePolicy


def create_app(
    triage_policy: TriagePolicy | None = None,
    question_refiner: QuestionRefiner | None = None,
    intent_classifier: IntentClassifier | None = None,
    doctor_repository: DoctorRepository | None = None,
    recommendation_engine: DoctorRecommendationEngine | None = None,
) -> FastAPI:
    """Build an app with injectable triage, Groq, and doctor-catalog components."""
    policy = triage_policy or ConservativeDefaultPolicy()
    refiner = question_refiner or QuestionRefiner()
    classifier = intent_classifier or IntentClassifier()
    catalog = doctor_repository or JsonDoctorRepository.from_environment()
    recommender = recommendation_engine or DoctorRecommendationEngine(RecommendationSettings())
    api = FastAPI(
        title="Assistant d’orientation santé",
        version="0.1.0",
        description="Informations générales et orientation en santé. Ce service ne pose pas de diagnostic.",
    )
    api.include_router(build_router(policy, refiner, classifier))
    api.include_router(build_recommendation_router(catalog, recommender))
    return api


app = create_app()
