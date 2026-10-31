"""Field extraction for Aadhaar and PAN OCR text.

Extraction is independent per field. DOB and gender parsing use labels and
document text only; values are never inferred from names or test identities.
"""

from __future__ import annotations

import re
from collections.abc import Callable
from datetime import date


_DATE_TOKEN = re.compile(
    r"(?<![A-Za-z0-9])([0-9OoIl|]{1,4}[./-][0-9OoIl|]{1,2}[./-][0-9OoIl|]{2,4}|"
    r"[0-9OoIl|]{4}-[0-9OoIl|]{1,2}-[0-9OoIl|]{1,2})(?![A-Za-z0-9])"
)
_DOB_LABEL = re.compile(
    r"(?:\bD\s*\.?\s*O\s*\.?\s*B\s*\.?\b|\bD0B\b|"
    r"\bDATE\s+OF\s+BIRTH\b|\bBIRTH\s+DATE\b|जन्म\s*(?:तिथि|दिनांक))",
    re.I,
)
_GENDER_LABEL = re.compile(r"\b(?:gender|sex)\b", re.I)
_GENDER_VALUE = re.compile(
    r"(?<![A-Za-z])(?:female|fema[l1i]e|male|ma[l1i]e|transgender|trans|other|unknown|m|f)(?![A-Za-z])",
    re.I,
)
_AADHAAR_NUMBER = re.compile(r"(?<!\d)(?:\d{4}[ -]?){2}\d{4}(?!\d)")
_PAN_NUMBER = re.compile(r"(?<![A-Z0-9])[A-Z]{5}\d{4}[A-Z](?![A-Z0-9])", re.I)


def _clean_lines(text: str) -> list[str]:
    return [line.strip() for line in text.splitlines() if line.strip()]


def _normalize_date_token(raw: str) -> str | None:
    """Correct common OCR digit confusions within a date candidate only."""
    candidate = raw.translate(str.maketrans({"O": "0", "o": "0", "I": "1", "l": "1", "|": "1"}))
    parts = re.split(r"([./-])", candidate)
    if len(parts) != 5:
        return None
    first, separator, second, separator2, third = parts
    if separator != separator2:
        return None
    if not all(part.isdigit() for part in (first, second, third)):
        return None

    if separator == "-" and len(first) == 4:
        year, month, day = int(first), int(second), int(third)
    else:
        day, month, year = int(first), int(second), int(third)
    if year < 100 or year > 9999:
        return None
    try:
        parsed = date(year, month, day)
    except ValueError:
        return None
    today = date.today()
    try:
        earliest = today.replace(year=today.year - 130)
    except ValueError:
        earliest = today.replace(year=today.year - 130, day=28)
    if parsed > today or parsed < earliest:
        return None
    return parsed.isoformat()


def _date_candidates(text: str) -> list[tuple[str, str]]:
    results: list[tuple[str, str]] = []
    for match in _DATE_TOKEN.finditer(text):
        raw = match.group(1)
        normalized = _normalize_date_token(raw)
        if normalized:
            results.append((raw, normalized))
    return results


def _parse_date(text: str, *, marked_only: bool) -> str | None:
    """Return the raw date token beside a recognized DOB label.

    For PAN only, an unlabelled date is accepted when exactly one plausible
    date occurs in the OCR text, matching the common PAN card layout.
    """
    lines = _clean_lines(text)
    for index, line in enumerate(lines):
        label = _DOB_LABEL.search(line)
        if not label:
            continue
        candidates = _date_candidates(line[label.end() :])
        if not candidates and index + 1 < len(lines):
            candidates = _date_candidates(lines[index + 1])
        if candidates:
            return candidates[0][0]
    if marked_only:
        return None
    candidates = _date_candidates(text)
    return candidates[0][0] if len(candidates) == 1 else None


def _parse_gender(text: str) -> str | None:
    """Extract gender only from an explicit label or a standalone value line."""
    lines = _clean_lines(text)
    for index, line in enumerate(lines):
        label = _GENDER_LABEL.search(line)
        if label:
            candidates = _GENDER_VALUE.findall(line[label.end() :])
            if not candidates and index + 1 < len(lines):
                candidates = _GENDER_VALUE.findall(lines[index + 1])
            if candidates:
                return candidates[0]
    for line in lines:
        if re.fullmatch(r"\s*(?:female|fema[l1i]e|male|ma[l1i]e|transgender|trans|other|unknown|m|f)\s*[.!]?\s*", line, re.I):
            match = _GENDER_VALUE.search(line)
            if match:
                return match.group(0)

    # OCR can lose a short field label while retaining the adjacent value
    # (for example, two compact words on the card). Accept only a unique full
    # gender word on a short line; never infer from a name or long prose.
    compact_candidates: list[tuple[str, str]] = []
    for line in lines:
        words = re.findall(r"[A-Za-z]+", line)
        if len(words) > 2 or len(line) > 18:
            continue
        for match in _GENDER_VALUE.finditer(line):
            raw = match.group(0)
            if len(raw) == 1:
                continue
            canonical = raw.casefold().replace("1", "l").replace("i", "l")
            if canonical in {"male", "female", "transgender", "trans", "other", "unknown"}:
                compact_candidates.append((canonical, raw))
    distinct = {canonical for canonical, _ in compact_candidates}
    if len(distinct) == 1:
        return compact_candidates[0][1]
    return None


def _parse_aadhaar_name(lines: list[str]) -> str | None:
    for index, line in enumerate(lines[:-1]):
        if "government of india" in line.casefold():
            candidate = lines[index + 1]
            if not re.search(r"\d{4}", candidate) and not _DATE_TOKEN.search(candidate):
                return candidate
    return None


def _parse_address(lines: list[str]) -> str | None:
    for index, line in enumerate(lines):
        match = re.match(r"^address\s*:\s*(.*)$", line, re.I)
        if not match:
            continue
        parts = [match.group(1).strip()] if match.group(1).strip() else []
        for following in lines[index + 1 :]:
            if _DOB_LABEL.match(following) or _GENDER_LABEL.match(following):
                break
            if _AADHAAR_NUMBER.search(following):
                break
            parts.append(following)
        return " ".join(part for part in parts if part) or None
    return None


def parse_aadhaar(raw_text: str) -> dict[str, str]:
    """Extract fields found in Aadhaar OCR text; absent fields are omitted."""
    lines = _clean_lines(raw_text)
    fields: dict[str, str] = {}

    # Every field is parsed independently so one missed label cannot suppress another.
    name = _parse_aadhaar_name(lines)
    if name:
        fields["name"] = name

    date_of_birth = _parse_date(raw_text, marked_only=True)
    if date_of_birth:
        fields["date_of_birth"] = date_of_birth

    gender = _parse_gender(raw_text)
    if gender:
        fields["gender"] = gender

    aadhaar_number = _AADHAAR_NUMBER.search(raw_text)
    if aadhaar_number:
        fields["aadhaar_number"] = re.sub(r"\D", "", aadhaar_number.group(0))

    address = _parse_address(lines)
    if address:
        fields["address"] = address

    return fields


def parse_pan(raw_text: str) -> dict[str, str]:
    """Extract PAN fields using the documented label and positional heuristics."""
    lines = _clean_lines(raw_text)
    fields: dict[str, str] = {}

    pan_number = _PAN_NUMBER.search(raw_text)
    if pan_number:
        fields["pan_number"] = pan_number.group(0).upper()

    date_of_birth = _parse_date(raw_text, marked_only=False)
    if date_of_birth:
        fields["date_of_birth"] = date_of_birth

    label_indices = [
        i for i, line in enumerate(lines)
        if re.search(r"\b(name|father'?s name)\b", line, re.I)
    ]
    for index in label_indices:
        label = lines[index].casefold()
        value = lines[index].split(":", 1)[1].strip() if ":" in lines[index] else ""
        if not value and index + 1 < len(lines):
            value = lines[index + 1]
        if not value:
            continue
        if "father" in label:
            fields.setdefault("father_name", value)
        else:
            fields.setdefault("name", value)

    if "name" not in fields:
        candidates = [
            line for line in lines
            if re.fullmatch(r"[A-Z][A-Z .'-]{2,}", line)
            and not re.search(r"(INCOME TAX|PERMANENT ACCOUNT|GOVERNMENT OF INDIA)", line, re.I)
            and not _DATE_TOKEN.search(line)
            and not _PAN_NUMBER.search(line)
        ]
        if candidates:
            fields["name"] = candidates[0]
        if len(candidates) > 1:
            fields["father_name"] = candidates[1]

    return fields


PARSERS: dict[str, Callable[[str], dict[str, str]]] = {
    "AADHAAR": parse_aadhaar,
    "PAN": parse_pan,
}


def parse_document(document_type: str, raw_text: str) -> dict[str, str]:
    """Dispatch to a supported parser without logging document text."""
    parser = PARSERS.get(document_type.upper())
    if parser is None:
        raise ValueError("document_type must be AADHAAR or PAN")
    return parser(raw_text)
