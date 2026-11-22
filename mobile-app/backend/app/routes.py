"""HTTP routes for chat and liveness checks."""

import logging
from pathlib import Path

from fastapi import APIRouter
from fastapi.responses import FileResponse

from app.intent import IntentClassificationError, IntentClassifier
from app.llm import QuestionRefiner
from app.schemas import ChatRequest, ChatResponse, FollowUpQuestion
from app.triage import TriagePolicy

logger = logging.getLogger(__name__)

DISCLAIMER = (
    "Ce service ne remplace pas les soins d’un professionnel de santé et ne pose pas "
    "de diagnostic. En cas d’urgence présumée, contactez immédiatement les services "
    "d’urgence locaux."
)
GREETINGS = {
    "hi",
    "hello",
    "hey",
    "hi there",
    "hello there",
    "good morning",
    "good afternoon",
    "good evening",
}
ASSISTANT_ERROR_MESSAGES = {
    "api_key_missing": "Le service Groq n’est pas configuré. Ajoutez GROQ_API_KEY au serveur de l’application.",
    "api_key_invalid": "La clé Groq est invalide ou n’a pas accès à ce modèle. Vérifiez la configuration du serveur.",
    "rate_limited": "Le service Groq est temporairement limité. Veuillez patienter, puis réessayer.",
    "provider_unavailable": "Le service Groq est inaccessible pour le moment. Vérifiez votre connexion, puis réessayez.",
    "timeout": "Le modèle met trop de temps à répondre. Réessayez ou choisissez un modèle plus rapide.",
    "model_runtime_error": "Groq n’a pas pu générer une réponse. Vérifiez le modèle configuré et réessayez.",
    "invalid_response": "La réponse du modèle était vide ou invalide. Veuillez réessayer.",
}


def build_router(
    policy: TriagePolicy,
    refiner: QuestionRefiner,
    classifier: IntentClassifier,
) -> APIRouter:
    """Create endpoints bound to the configured policy and question refiner."""
    router = APIRouter()

    @router.get("/", include_in_schema=False)
    async def chat_page() -> FileResponse:
        """Serve the browser-based chat client."""
        return FileResponse(Path(__file__).parent / "static" / "index.html")

    @router.get("/health", tags=["health"])
    async def health() -> dict[str, str]:
        """Basic liveness check."""
        return {"status": "ok"}

    @router.post("/chat", response_model=ChatResponse, tags=["chat"])
    async def chat(request: ChatRequest) -> ChatResponse:
        """Evaluate a symptom description under the configured rules policy."""
        try:
            # Clinician-reviewed emergency rules have priority over routine intent.
            result = policy.evaluate(request.current_message, request.answers)
        except Exception as exc:
            # Do not include exception text or symptom content in application logs.
            logger.error("Triage policy failed: type=%s", type(exc).__name__)
            return ChatResponse(
                level="medical_advice",
                message="Je ne peux pas déterminer le niveau de soins adapté pour le moment. Veuillez demander conseil à un professionnel de santé.",
                disclaimer=DISCLAIMER,
            )

        # Never let an emergency rule proceed into routine classification/questions.
        if result.level == "emergency":
            return ChatResponse(
                level="emergency",
                message="Vos réponses correspondent à un critère d’urgence. Contactez immédiatement les services d’urgence locaux.",
                disclaimer=DISCLAIMER,
            )

        normalized_message = request.current_message.casefold().strip().rstrip(".!?,")
        if normalized_message in GREETINGS:
            return ChatResponse(
                level="general_information",
                message="Bonjour ! Je peux vous renseigner sur la santé et vous orienter vers les soins adaptés. Que souhaitez-vous savoir ?",
                disclaimer=DISCLAIMER,
            )

        try:
            classification = await classifier.classify(
                request.current_message,
                request.conversation,
            )
        except IntentClassificationError as exc:
            return ChatResponse(
                level="medical_advice",
                message=ASSISTANT_ERROR_MESSAGES.get(
                    exc.kind,
                    "Le service de réponse est indisponible. Pour une décision médicale personnelle, consultez un professionnel de santé.",
                ),
                disclaimer=DISCLAIMER,
            )

        if classification.intent == "emergency":
            return ChatResponse(
                level="emergency",
                message="Cette situation peut nécessiter une aide urgente. Contactez immédiatement les services d’urgence locaux.",
                disclaimer=DISCLAIMER,
            )

        if classification.intent == "out_of_scope":
            return ChatResponse(
                level="out_of_scope",
                message="Je peux uniquement répondre aux questions de santé et vous orienter vers les soins adaptés. Pour une inquiétude ou une décision médicale personnelle, veuillez consulter un professionnel de santé qualifié.",
                disclaimer=DISCLAIMER,
            )

        if classification.intent in {"general_information", "educational", "translation"}:
            return ChatResponse(
                level=classification.intent,
                message=classification.answer,
                disclaimer=DISCLAIMER,
            )

        if result.level is None and result.question_id and result.question_text:
            try:
                question_text = await refiner.refine(result.question_text)
            except Exception as exc:
                logger.warning("Question wording provider failed: type=%s", type(exc).__name__)
                question_text = None
            if not question_text:
                return ChatResponse(
                    level="medical_advice",
                    message="Je ne peux pas formuler la question de suivi de façon fiable pour le moment. Pour un avis personnalisé, veuillez consulter un professionnel de santé.",
                    disclaimer=DISCLAIMER,
                )
            return ChatResponse(
                level="medical_advice",
                message="J’ai besoin d’une précision pour vous orienter. Si vous avez encore un doute, contactez un professionnel de santé.",
                follow_up_question=FollowUpQuestion(
                    question_id=result.question_id,
                    text=question_text,
                ),
                disclaimer=DISCLAIMER,
            )

        # Personalized requests always receive a professional-care redirect.
        # The model's answer is intentionally discarded for this intent.
        level = "medical_advice"
        messages = {
            "medical_advice": "Je ne peux pas poser de diagnostic ni recommander un traitement personnalisé. Veuillez demander conseil à un professionnel de santé qualifié.",
            "self_care_information": "Les règles configurées indiquent que des informations générales de soins personnels peuvent convenir. Si vous êtes inquiet ou si vos symptômes changent, contactez un professionnel de santé.",
        }
        return ChatResponse(
            level=level,
            message=messages.get(level, messages["medical_advice"]),
            disclaimer=DISCLAIMER,
        )

    return router
