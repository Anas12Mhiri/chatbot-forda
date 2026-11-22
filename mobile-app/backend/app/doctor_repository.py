"""Doctor catalog access boundary for recommendation data."""

import json
import hashlib
import os
from pathlib import Path
from typing import Protocol
import unicodedata

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
        """Use a configured file, or the bundled Tunisian directory if present."""
        path = os.getenv("DOCTOR_DATA_PATH")
        if path:
            return cls(path)
        for parent in Path(__file__).resolve().parents:
            bundled = parent / "data" / "annuaire_medecins_demo.json"
            if bundled.is_file():
                return cls(bundled)
        return EmptyDoctorRepository()

    def list_doctors(self) -> list[DoctorProfile]:
        """Read an array of doctor records and validate every field with Pydantic."""
        with self.path.open("r", encoding="utf-8") as catalog_file:
            records = json.load(catalog_file)
        if not isinstance(records, list):
            raise ValueError("Doctor catalog JSON must contain an array")
        return [DoctorProfile.model_validate(_normalize_record(record, index)) for index, record in enumerate(records)]


def normalize_filter(value: str | None) -> str:
    """Normalize accents and case for French catalog filters."""
    value = unicodedata.normalize("NFKD", value or "")
    return "".join(char for char in value if not unicodedata.combining(char)).casefold().strip()


def _normalize_record(record: dict, index: int) -> dict:
    """Accept both the API schema and the French annuaire JSON schema."""
    if "doctor_id" in record:
        return record

    first_name = str(record.get("prenom") or "").strip()
    last_name = str(record.get("nom") or "").strip()
    name = " ".join(part for part in (first_name, last_name) if part) or f"Médecin {index + 1}"
    specialty = str(record.get("lib_spec") or "Médecine générale").strip()
    city = str(record.get("lib_localite") or record.get("lib_deleg") or record.get("lib_gouv") or "").strip() or None
    governorate = str(record.get("lib_gouv") or "").strip() or None
    address = " · ".join(str(record.get(key)).strip() for key in ("adr1", "adr2") if record.get(key))
    postal_code = str(record.get("cod_postal") or "").strip()
    if postal_code:
        address = " · ".join(part for part in (address, postal_code, city, governorate) if part)
    identifier_source = "|".join((name, specialty, str(record.get("tel") or ""), address, str(index)))
    doctor_id = "od-" + hashlib.sha256(identifier_source.encode("utf-8")).hexdigest()[:20]
    reviews = []
    for item in record.get("avis", []) or []:
        if isinstance(item, str):
            text = item.strip()
            sentiment = None
        elif isinstance(item, dict):
            text = str(item.get("texte") or item.get("text") or "").strip()
            sentiment_value = str(item.get("sentiment") or "").casefold().strip()
            sentiment = {
                "positif": "positif", "positive": "positif",
                "neutre": "neutre", "neutral": "neutre",
                "négatif": "négatif", "negatif": "négatif", "negative": "négatif",
            }.get(sentiment_value)
        else:
            continue
        if text:
            review = {"text": text}
            if sentiment:
                review["sentiment"] = sentiment
            reviews.append(review)
    phone = record.get("gsm") or record.get("tel")
    return {
        "doctor_id": doctor_id,
        "name": name,
        "specialty": specialty,
        "phone": str(phone) if phone else None,
        "email": record.get("email") or None,
        "address": address or None,
        "city": city,
        "governorate": governorate,
        "clinic": record.get("lib_etab") or record.get("lib_pers") or None,
        "experience_years": record.get("annees_experience"),
        "experience_synthetic": bool(record.get("experience_synthetique", False)),
        "reviews": reviews,
        "reviews_synthetic": bool(record.get("avis_synthetiques", False)),
    }
