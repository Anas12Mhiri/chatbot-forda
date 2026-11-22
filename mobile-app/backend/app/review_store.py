"""Durable, transactional storage for real physician reviews and score counters."""

import os
import sqlite3
import uuid
from contextlib import closing
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from app.review_scoring import recommendation_ratio_from_counts


@dataclass(frozen=True)
class ReviewStats:
    count: int = 0
    positive: int = 0
    neutral: int = 0
    negative: int = 0
    ratio: float | None = None
    updated_at: str | None = None


class SQLiteReviewStore:
    """Persist a classified review and recompute its doctor's score atomically."""

    def __init__(self, path: str | Path) -> None:
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._initialize()

    @classmethod
    def from_environment(cls) -> "SQLiteReviewStore":
        configured = os.getenv("DOCTOR_REVIEWS_DB_PATH")
        if configured:
            return cls(configured)
        for parent in Path(__file__).resolve().parents:
            data_dir = parent / "data"
            if (data_dir / "annuaire_medecins_demo.json").is_file():
                return cls(data_dir / "doctor_reviews.sqlite3")
        return cls(Path.cwd() / "data" / "doctor_reviews.sqlite3")

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.path, timeout=30, isolation_level=None)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        return connection

    def _initialize(self) -> None:
        with closing(self._connect()) as connection:
            connection.execute("PRAGMA journal_mode = WAL")
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS doctor_reviews (
                    review_id TEXT PRIMARY KEY,
                    doctor_id TEXT NOT NULL,
                    text TEXT NOT NULL,
                    sentiment TEXT NOT NULL CHECK (sentiment IN ('positif', 'neutre', 'négatif')),
                    model_version TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS ix_doctor_reviews_doctor
                    ON doctor_reviews(doctor_id);
                CREATE TABLE IF NOT EXISTS doctor_review_scores (
                    doctor_id TEXT PRIMARY KEY,
                    review_count INTEGER NOT NULL,
                    positive_count INTEGER NOT NULL,
                    neutral_count INTEGER NOT NULL,
                    negative_count INTEGER NOT NULL,
                    recommendation_ratio REAL NOT NULL,
                    updated_at TEXT NOT NULL
                );
                """
            )

    @staticmethod
    def _stats_from_row(row: sqlite3.Row | None) -> ReviewStats:
        if row is None:
            return ReviewStats()
        return ReviewStats(
            count=row["review_count"],
            positive=row["positive_count"],
            neutral=row["neutral_count"],
            negative=row["negative_count"],
            ratio=row["recommendation_ratio"],
            updated_at=row["updated_at"],
        )

    def get_stats(self, doctor_id: str) -> ReviewStats:
        with closing(self._connect()) as connection:
            row = connection.execute(
                "SELECT * FROM doctor_review_scores WHERE doctor_id = ?",
                (doctor_id,),
            ).fetchone()
        return self._stats_from_row(row)

    def get_all_stats(self) -> dict[str, ReviewStats]:
        with closing(self._connect()) as connection:
            rows = connection.execute("SELECT * FROM doctor_review_scores").fetchall()
        return {row["doctor_id"]: self._stats_from_row(row) for row in rows}

    def add_review(
        self,
        doctor_id: str,
        text: str,
        sentiment: str,
        model_version: str,
    ) -> tuple[str, ReviewStats]:
        if sentiment not in {"positif", "neutre", "négatif"}:
            raise ValueError("Sentiment must be positif, neutre, or négatif")
        review_id = uuid.uuid4().hex
        timestamp = datetime.now(timezone.utc).isoformat(timespec="seconds")
        connection = self._connect()
        try:
            connection.execute("BEGIN IMMEDIATE")
            connection.execute(
                """INSERT INTO doctor_reviews
                   (review_id, doctor_id, text, sentiment, model_version, created_at)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (review_id, doctor_id, text, sentiment, model_version, timestamp),
            )
            counts = connection.execute(
                """SELECT
                       COUNT(*) AS total,
                       SUM(CASE WHEN sentiment = 'positif' THEN 1 ELSE 0 END) AS positive,
                       SUM(CASE WHEN sentiment = 'neutre' THEN 1 ELSE 0 END) AS neutral,
                       SUM(CASE WHEN sentiment = 'négatif' THEN 1 ELSE 0 END) AS negative
                   FROM doctor_reviews WHERE doctor_id = ?""",
                (doctor_id,),
            ).fetchone()
            ratio = recommendation_ratio_from_counts(
                counts["positive"], counts["neutral"], counts["negative"]
            )
            connection.execute(
                """INSERT INTO doctor_review_scores
                   (doctor_id, review_count, positive_count, neutral_count, negative_count,
                    recommendation_ratio, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?)
                   ON CONFLICT(doctor_id) DO UPDATE SET
                     review_count = excluded.review_count,
                     positive_count = excluded.positive_count,
                     neutral_count = excluded.neutral_count,
                     negative_count = excluded.negative_count,
                     recommendation_ratio = excluded.recommendation_ratio,
                     updated_at = excluded.updated_at""",
                (
                    doctor_id, counts["total"], counts["positive"], counts["neutral"],
                    counts["negative"], ratio, timestamp,
                ),
            )
            connection.commit()
            stats = ReviewStats(
                count=counts["total"],
                positive=counts["positive"],
                neutral=counts["neutral"],
                negative=counts["negative"],
                ratio=ratio,
                updated_at=timestamp,
            )
            return review_id, stats
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()
