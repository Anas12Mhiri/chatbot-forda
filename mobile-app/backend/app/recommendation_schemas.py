"""Validated API and catalog schemas for doctor recommendations."""

import math
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

Criterion = Literal[
    "location",
    "experience",
    "operations",
    "reviews",
    "biography",
    "education",
]


class Qualification(BaseModel):
    """A structured qualification; institution prestige is deliberately unused."""

    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=1, max_length=200)
    specialty: str | None = Field(default=None, max_length=120)
    level: Literal["specialist", "postgraduate", "certification", "general"]
    verified: bool = False


class DoctorProfile(BaseModel):
    """Doctor catalog record; this is not a clinical quality assessment."""

    model_config = ConfigDict(extra="forbid")

    doctor_id: str = Field(min_length=1, max_length=100)
    name: str = Field(min_length=1, max_length=200)
    specialty: str = Field(min_length=1, max_length=120)
    specialties: list[str] = Field(default_factory=list, max_length=20)
    subspecialties: list[str] = Field(default_factory=list, max_length=30)
    phone: str | None = Field(default=None, max_length=60)
    email: str | None = Field(default=None, max_length=254)
    address: str | None = Field(default=None, max_length=500)
    latitude: float | None = Field(default=None, ge=-90, le=90, allow_inf_nan=False)
    longitude: float | None = Field(default=None, ge=-180, le=180, allow_inf_nan=False)
    experience_years: int | None = Field(default=None, ge=0, le=100)
    operations_count: int | None = Field(default=None, ge=0)
    operation_specialties: list[str] | None = Field(default=None, max_length=30)
    average_rating: float | None = Field(default=None, ge=0, le=5, allow_inf_nan=False)
    review_count: int = Field(default=0, ge=0)
    biography: str | None = Field(default=None, max_length=8000)
    education: list[Qualification] | None = Field(default=None, max_length=50)

    @model_validator(mode="after")
    def validate_coordinates_and_reviews(self) -> "DoctorProfile":
        """Require coordinate pairs and coherent review fields."""
        if (self.latitude is None) != (self.longitude is None):
            raise ValueError("Doctor latitude and longitude must be provided together")
        if self.review_count and self.average_rating is None:
            raise ValueError("A nonzero review count requires an average rating")
        return self


class RecommendationRequest(BaseModel):
    """Explicit patient search inputs; no patient identity is requested."""

    model_config = ConfigDict(extra="forbid")

    patient_query: str = Field(min_length=1, max_length=2000)
    specialty: str = Field(min_length=1, max_length=120)
    latitude: float | None = Field(default=None, ge=-90, le=90, allow_inf_nan=False)
    longitude: float | None = Field(default=None, ge=-180, le=180, allow_inf_nan=False)
    count: int = Field(default=3, ge=1, le=10)
    criterion_preferences: dict[Criterion, float] | None = None

    @model_validator(mode="after")
    def validate_request(self) -> "RecommendationRequest":
        """Reject partial locations and invalid optional preference weights."""
        if (self.latitude is None) != (self.longitude is None):
            raise ValueError("Patient latitude and longitude must be provided together")
        if self.criterion_preferences is not None:
            values = list(self.criterion_preferences.values())
            if any(not math.isfinite(value) or value < 0 for value in values) or sum(values) <= 0:
                raise ValueError("Criterion preferences must be nonnegative with a positive sum")
        return self


class CriterionScores(BaseModel):
    """Normalized criterion scores; `None` means source information was missing."""

    location: float | None = None
    experience: float | None = None
    operations: float | None = None
    reviews: float | None = None
    biography: float | None = None
    education: float | None = None


class DoctorRecommendation(BaseModel):
    """Explainable profile match returned by the deterministic engine."""

    doctor_id: str
    name: str
    specialty: str
    phone: str | None = None
    email: str | None = None
    address: str | None = None
    distance_km: float | None = None
    experience_years: int | None = None
    operations_count: int | None = None
    average_rating: float | None = None
    review_count: int
    topsis_score: float
    criteria_scores: CriterionScores
    missing_information: list[str]
    explanation: list[str]


class UnrankedDoctorProfile(BaseModel):
    """Eligible catalog profile excluded because it lacks enough usable data."""

    doctor_id: str
    name: str
    specialty: str
    missing_information: list[str]


class RecommendationAlgorithm(BaseModel):
    """Method metadata and effective weights used for this result."""

    method: str = "AHP-TOPSIS"
    weights_source: Literal["baseline", "ahp", "patient_preferences"]
    weights: dict[Criterion, float]
    consistency_ratio: float | None = None
    maximum_eigenvalue: float | None = None
    consistency_index: float | None = None
    note: str = (
        "Le score mesure l’adéquation du profil aux critères fournis; il ne prouve "
        "pas une supériorité médicale ni un résultat clinique et ne remplace pas "
        "un avis médical. En cas d’urgence présumée, contactez les services d’urgence locaux."
    )


class RecommendationResponse(BaseModel):
    """Recommendation API response, including an explicit no-match state."""

    status: Literal["success", "no_matches", "insufficient_information"]
    recommendations: list[DoctorRecommendation]
    unranked_profiles: list[UnrankedDoctorProfile] = Field(default_factory=list)
    algorithm: RecommendationAlgorithm
    excluded_for_insufficient_information: int = 0
    message: str | None = None
