"""Optional follow-up wording refinement; the LLM never makes triage decisions."""

import logging
import os

import httpx

logger = logging.getLogger(__name__)


class QuestionRefiner:
    """Optionally rephrase questions through Ollama's native chat API."""

    def __init__(self) -> None:
        self.model = os.getenv("OLLAMA_MODEL", "qwen3:4b")
        self.base_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434").rstrip("/")

    async def refine(self, question: str) -> str | None:
        """Return a French rephrasing, or `None` if the provider is unavailable."""
        payload = {
            "model": self.model,
            "stream": False,
            "think": False,
            "keep_alive": "5m",
            "options": {"temperature": 0, "num_ctx": 2048, "num_predict": 128},
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "Translate and rephrase the supplied clinician-authored follow-up "
                        "question in clear, natural French. Return one question only and "
                        "preserve its meaning. Do not add questions, advice, diagnosis, "
                        "urgency, or treatment instructions."
                    ),
                },
                {"role": "user", "content": question},
            ],
        }
        try:
            async with httpx.AsyncClient(timeout=45.0) as client:
                response = await client.post(
                    f"{self.base_url}/api/chat",
                    json=payload,
                )
                response.raise_for_status()
                text = response.json()["message"]["content"]
                if isinstance(text, str) and text.strip() and len(text) <= 500:
                    return text.strip()
        except (httpx.HTTPError, KeyError, IndexError, TypeError, ValueError) as exc:
            logger.warning("Question wording provider unavailable: type=%s", type(exc).__name__)
        return None
