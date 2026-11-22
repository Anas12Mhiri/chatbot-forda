"""Doctor catalog access boundary for recommendation data."""

import json
import os
from pathlib import Path
from typing import Protocol

from app.recommendation_schemas import DoctorProfile


class DoctorRepository(Protocol):
    """Storage contract; implementations may use a database or external catalog."""

    def list_doctors(self) -> list[DoctorProfile]:
        """Return the available doctor profiles without changing their data."""


class InMemoryDoctorRepository:
    """Small injectable repository useful for integration and local wiring."""

    def __init__(self, doctors: list[DoctorProfile] | None = None) -> None:
        self._doctors = list(doctors or [])

    def list_doctors(self) -> list[DoctorProfile]:
        """Return a shallow copy so callers cannot mutate the catalog list."""
        return list(self._doctors)


class EmptyDoctorRepository:
    """Safe default until a real doctor database is connected."""

    def list_doctors(self) -> list[DoctorProfile]:
        """Return no records rather than fabricating production profiles."""
        return []


class JsonDoctorRepository:
    """Load a validated doctor catalog from a configured JSON file."""

    def __init__(self, path: str | Path) -> None:
        self.path = Path(path)

    @classmethod
    def from_environment(cls) -> "JsonDoctorRepository | EmptyDoctorRepository":
        """Use `DOCTOR_DATA_PATH` when set; otherwise keep the catalog empty."""
        path = os.getenv("DOCTOR_DATA_PATH")
        return cls(path) if path else EmptyDoctorRepository()

    def list_doctors(self) -> list[DoctorProfile]:
        """Read an array of doctor records and validate every field with Pydantic."""
        with self.path.open("r", encoding="utf-8") as catalog_file:
            records = json.load(catalog_file)
        if not isinstance(records, list):
            raise ValueError("Doctor catalog JSON must contain an array")
        return [DoctorProfile.model_validate(record) for record in records]
