"""HTTP API for deterministic doctor recommendations."""

import logging

from fastapi import APIRouter, HTTPException

from app.doctor_repository import DoctorRepository
from app.recommendation_engine import DoctorRecommendationEngine, InconsistentComparisonsError
from app.recommendation_schemas import RecommendationRequest, RecommendationResponse

logger = logging.getLogger(__name__)


def build_recommendation_router(
    repository: DoctorRepository,
    engine: DoctorRecommendationEngine,
) -> APIRouter:
    """Bind the catalog and pure recommendation engine to a standalone route."""
    router = APIRouter(prefix="/doctors", tags=["doctor recommendations"])

    @router.post("/recommendations", response_model=RecommendationResponse)
    def recommend_doctors(request: RecommendationRequest) -> RecommendationResponse:
        """Return a ranked list based solely on structured catalog data and request fields."""
        try:
            doctors = repository.list_doctors()
        except Exception as exc:
            logger.error("Doctor catalog read failed: type=%s", type(exc).__name__)
            raise HTTPException(status_code=503, detail="Le catalogue de médecins est indisponible.") from exc
        try:
            return engine.recommend(request, doctors)
        except InconsistentComparisonsError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

    return router
