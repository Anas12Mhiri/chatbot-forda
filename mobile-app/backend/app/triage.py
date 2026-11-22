"""Rules interface for care navigation.

Production rules should be clinician-reviewed and supplied by the application.
This module intentionally contains no symptom-to-emergency medical rules.
"""

from dataclasses import dataclass
from typing import Protocol

from app.schemas import CareLevel, FollowUpAnswer


@dataclass(frozen=True)
class TriageResult:
    """A policy result. A follow-up can be requested when level is unresolved."""

    level: CareLevel | None = None
    question_id: str | None = None
    question_text: str | None = None


class TriagePolicy(Protocol):
    """Evaluates symptoms using explicit, externally supplied rules."""

    def evaluate(self, symptoms: str, answers: list[FollowUpAnswer]) -> TriageResult:
        """Return a level or a single focused follow-up question."""


class ConservativeDefaultPolicy:
    """Safe starter policy: no invented rules; unresolved cases get medical advice."""

    def evaluate(self, symptoms: str, answers: list[FollowUpAnswer]) -> TriageResult:
        return TriageResult(level="medical_advice")
