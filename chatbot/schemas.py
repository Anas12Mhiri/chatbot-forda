"""Validated API request and response models."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

IntentLevel = Literal[
    "emergency",
    "general_information",
    "educational",
    "translation",
    "medical_advice",
    "out_of_scope",
]
CareLevel = Literal["emergency", "medical_advice", "self_care_information"]


class FollowUpAnswer(BaseModel):
    """An answer to a question previously returned by a clinician-reviewed rule."""

    model_config = ConfigDict(extra="forbid")

    question_id: str = Field(min_length=1, max_length=80)
    answer: str = Field(min_length=1, max_length=1000)


class ConversationTurn(BaseModel):
    """One recent turn sent by the browser to maintain conversational context."""

    model_config = ConfigDict(extra="forbid")

    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=2000)


class ChatRequest(BaseModel):
    """Current chat message plus a small, untrusted recent history."""

    model_config = ConfigDict(extra="forbid")

    message: str | None = Field(default=None, min_length=1, max_length=4000)
    # Backward-compatible input for clients built before the chat UI.
    symptoms: str | None = Field(default=None, min_length=1, max_length=4000)
    conversation: list[ConversationTurn] = Field(default_factory=list, max_length=10)
    answers: list[FollowUpAnswer] = Field(default_factory=list, max_length=5)

    @model_validator(mode="after")
    def require_current_message(self) -> "ChatRequest":
        """Require either the new `message` field or legacy `symptoms` field."""
        if not self.message and not self.symptoms:
            raise ValueError("A message is required")
        return self

    @property
    def current_message(self) -> str:
        """Return the current message while preserving legacy API clients."""
        return self.message or self.symptoms or ""


class FollowUpQuestion(BaseModel):
    """A focused question produced by an injected triage policy."""

    question_id: str = Field(min_length=1, max_length=80)
    text: str = Field(min_length=1, max_length=500)


class ChatResponse(BaseModel):
    """Intent or care-navigation result, never a diagnosis."""

    level: IntentLevel | Literal["self_care_information"]
    message: str
    follow_up_question: FollowUpQuestion | None = None
    disclaimer: str = (
        "Ce service ne remplace pas les soins d’un professionnel de santé et ne pose pas "
        "de diagnostic. En cas d’urgence présumée, contactez immédiatement les services "
        "d’urgence locaux."
    )
