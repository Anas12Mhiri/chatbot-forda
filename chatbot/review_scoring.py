"""Review-only sentiment score used by doctor recommendations."""

from collections.abc import Iterable

from app.recommendation_schemas import DoctorReview

SENTIMENT_ALIASES = {
    "positif": "positif",
    "positive": "positif",
    "neutre": "neutre",
    "neutral": "neutre",
    "négatif": "négatif",
    "negatif": "négatif",
    "negative": "négatif",
}


def sentiment_counts(reviews: Iterable[DoctorReview]) -> dict[str, int]:
    """Count only reviews that have a recognized sentiment model output."""
    counts = {"positif": 0, "neutre": 0, "négatif": 0}
    for review in reviews:
        label = SENTIMENT_ALIASES.get((review.sentiment or "").casefold().strip())
        if label:
            counts[label] += 1
    return counts


def recommendation_ratio(reviews: Iterable[DoctorReview], k: int = 10) -> float | None:
    """Return the smoothed positive/neutral/negative ratio, or None if unclassified."""
    counts = sentiment_counts(reviews)
    return recommendation_ratio_from_counts(
        counts["positif"], counts["neutre"], counts["négatif"], k=k
    )


def recommendation_ratio_from_counts(
    positive: int,
    neutral: int,
    negative: int,
    k: int = 10,
) -> float | None:
    """Compute the smoothed ratio from stored counters."""
    if k < 0 or min(positive, neutral, negative) < 0:
        raise ValueError("k and sentiment counts must be nonnegative")
    classified = positive + neutral + negative
    if classified == 0:
        return None
    return round(100 * (positive + 0.5 * neutral + 0.5 * k) / (classified + k), 2)
