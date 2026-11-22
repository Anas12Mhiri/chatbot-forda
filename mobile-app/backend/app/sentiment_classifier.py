"""Inference adapter for the trained TF-IDF + LogisticRegression model."""

import os
from pathlib import Path
from typing import Protocol


class ReviewSentimentClassifier(Protocol):
    def classify_many(self, texts: list[str]) -> list[str]:
        """Return one French sentiment label per review text."""


class JoblibReviewSentimentClassifier:
    """Load the user's fitted scikit-learn pipeline once and reuse it."""

    ID_TO_SENTIMENT = {0: "négatif", 1: "neutre", 2: "positif"}

    def __init__(self, model_path: str | Path) -> None:
        import joblib

        self.model_path = Path(model_path)
        self.model = joblib.load(self.model_path)
        classes = {int(value) for value in getattr(self.model, "classes_", [])}
        if classes != set(self.ID_TO_SENTIMENT):
            raise ValueError(
                "Le modèle de sentiment doit utiliser les classes 0=négatif, 1=neutre, 2=positif."
            )
        if not callable(getattr(self.model, "predict", None)):
            raise TypeError("Le fichier joblib ne contient pas un modèle avec predict().")

    @classmethod
    def from_environment(cls) -> "JoblibReviewSentimentClassifier | None":
        configured = os.getenv("DOCTOR_SENTIMENT_MODEL_PATH") or os.getenv("SENTIMENT_MODEL_PATH")
        if configured:
            path = Path(configured)
            if not path.is_file():
                raise FileNotFoundError(f"Sentiment model not found: {path}")
            return cls(path)
        for parent in Path(__file__).resolve().parents:
            bundled = parent / "data" / "tfidf_logreg_sentiment.joblib"
            if bundled.is_file():
                return cls(bundled)
        return None

    def classify_many(self, texts: list[str]) -> list[str]:
        if not texts:
            return []
        predictions = self.model.predict(texts)
        return [self.ID_TO_SENTIMENT[int(label)] for label in predictions]
