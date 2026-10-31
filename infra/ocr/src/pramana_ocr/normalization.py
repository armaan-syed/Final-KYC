"""Normalization helpers used before field comparison."""

from __future__ import annotations

import re
from datetime import date, datetime


def normalize_name(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = re.sub(r"[^\w\s]", " ", value, flags=re.UNICODE)
    normalized = " ".join(normalized.upper().split())
    return normalized or None


def normalize_date(value: str | None) -> str | None:
    if value is None:
        return None
    raw = value.strip().translate(
        str.maketrans({"O": "0", "o": "0", "I": "1", "l": "1", "|": "1"})
    )
    for pattern in ("%d/%m/%Y", "%d-%m-%Y", "%d.%m.%Y", "%Y-%m-%d"):
        try:
            parsed = datetime.strptime(raw, pattern).date()
            today = date.today()
            try:
                earliest = today.replace(year=today.year - 130)
            except ValueError:
                earliest = today.replace(year=today.year - 130, day=28)
            if parsed > today or parsed < earliest:
                return None
            return parsed.isoformat()
        except ValueError:
            pass
    return None


def normalize_gender(value: str | None) -> str | None:
    if value is None:
        return None
    canonical = " ".join(value.casefold().split())
    aliases = {
        "m": "MALE",
        "male": "MALE",
        "ma1e": "MALE",
        "maie": "MALE",
        "f": "FEMALE",
        "female": "FEMALE",
        "fema1e": "FEMALE",
        "femaie": "FEMALE",
        "transgender": "OTHER",
        "trans": "OTHER",
        "other": "OTHER",
        "unknown": "UNKNOWN",
    }
    return aliases.get(canonical)


def normalize_value(field_name: str, value: str | None) -> str | None:
    if value is None:
        return None
    if field_name in {"name", "father_name", "fathers_name"}:
        return normalize_name(value)
    if field_name in {"dob", "date_of_birth"}:
        return normalize_date(value)
    if field_name == "gender":
        return normalize_gender(value)
    if field_name == "address":
        return " ".join(value.casefold().split()) or None
    return " ".join(value.split()) or None
