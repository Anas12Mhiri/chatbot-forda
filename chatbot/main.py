"""FastAPI application for patient symptom care navigation."""

from fastapi import FastAPI

from app.doctor_repository import DoctorRepository, JsonDoctorRepository
from app.intent import IntentClassifier
from app.llm import QuestionRefiner
from app.recommendation_routes import build_recommendation_router
from app.routes import build_router
from app.sentiment_classifier import JoblibReviewSentimentClassifier, ReviewSentimentClassifier
from app.review_store import SQLiteReviewStore
from app.triage import ConservativeDefaultPolicy, TriagePolicy


def create_app(
    triage_policy: TriagePolicy | None = None,
    question_refiner: QuestionRefiner | None = None,
    intent_classifier: IntentClassifier | None = None,
    doctor_repository: DoctorRepository | None = None,
    review_classifier: ReviewSentimentClassifier | None = None,
    review_store: SQLiteReviewStore | None = None,
) -> FastAPI:
    """Build an app with injectable triage, Ollama, and doctor-catalog components."""
    policy = triage_policy or ConservativeDefaultPolicy()
    refiner = question_refiner or QuestionRefiner()
    classifier = intent_classifier or IntentClassifier()
    catalog = doctor_repository or JsonDoctorRepository.from_environment()
    sentiment_model = review_classifier or JoblibReviewSentimentClassifier.from_environment()
    stored_reviews = review_store or SQLiteReviewStore.from_environment()
    api = FastAPI(
        title="Assistant d’orientation santé",
        version="0.1.0",
        description="Informations générales et orientation en santé. Ce service ne pose pas de diagnostic.",
    )
    api.include_router(build_router(policy, refiner, classifier))
    api.include_router(build_recommendation_router(catalog, sentiment_model, stored_reviews))
    return api


app = create_app()
