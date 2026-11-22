"""Optional Groq follow-up wording refinement; it never makes triage decisions."""

import logging
import os

import httpx

logger = logging.getLogger(__name__)


class QuestionRefiner:
    """Optionally rephrase questions through Groq's chat completions API."""

    def __init__(self) -> None:
        self.model = os.getenv("GROQ_MODEL", "openai/gpt-oss-20b")
        self.api_key = os.getenv("GROQ_API_KEY", "").strip()
        self.base_url = os.getenv("GROQ_BASE_URL", "https://api.groq.com/openai/v1").rstrip("/")

    async def refine(self, question: str) -> str | None:
        """Return a French rephrasing, or `None` if the provider is unavailable."""
        if not self.api_key:
            return None
        payload = {
            "model": self.model,
            "temperature": 0.1,
            "max_completion_tokens": 128,
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
                    f"{self.base_url}/chat/completions",
                    headers={"Authorization": f"Bearer {self.api_key}"},
                    json=payload,
                )
                response.raise_for_status()
                text = response.json()["choices"][0]["message"]["content"]
                if isinstance(text, str) and text.strip() and len(text) <= 500:
                    return text.strip()
        except (httpx.HTTPError, KeyError, IndexError, TypeError, ValueError) as exc:
            logger.warning("Groq question refiner unavailable: type=%s", type(exc).__name__)
        return None
