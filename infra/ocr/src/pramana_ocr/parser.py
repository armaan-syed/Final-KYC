"""Field extraction for Aadhaar and PAN OCR text.

This parser intentionally keeps extraction separate from database/API schemas.
Person B's canonical schema is the integration contract; adapters belong at
that boundary once the schema is confirmed.
"""

from __future__ import annotations

import re
from collections.abc import Callable


_DATE = r"(?:\d{2}[/-]\d{2}[/-]\d{4}|\d{4}-\d{2}-\d{2})"
_AADHAAR_NUMBER = re.compile(r"(?<!\d)(?:\d{4}[ -]?){2}\d{4}(?!\d)")
_PAN_NUMBER = re.compile(r"(?<![A-Z0-9])[A-Z]{5}\d{4}[A-Z](?![A-Z0-9])", re.I)
_DOB = re.compile(rf"\b(?:DOB|DATE\s+OF\s+BIRTH)\s*[:\-]?\s*({_DATE})\b", re.I)


def _clean_lines(text: str) -> list[str]:
    return [line.strip() for line in text.splitlines() if line.strip()]


def _parse_date(text: str, *, marked_only: bool) -> str | None:
    match = _DOB.search(text)
    if match:
        return match.group(1)
    if marked_only:
        return None
    match = re.search(rf"\b({_DATE})\b", text)
    return match.group(1) if match else None


def _parse_aadhaar_name(lines: list[str]) -> str | None:
    for index, line in enumerate(lines[:-1]):
        if "government of india" in line.casefold():
            candidate = lines[index + 1]
            if not re.search(r"\d{4}", candidate) and not re.search(_DATE, candidate):
                return candidate
    return None


def _parse_address(lines: list[str]) -> str | None:
    for index, line in enumerate(lines):
        match = re.match(r"^address\s*:\s*(.*)$", line, re.I)
        if not match:
            continue
        parts = [match.group(1).strip()] if match.group(1).strip() else []
        for following in lines[index + 1 :]:
            if re.match(r"^(?:VID|DOB|DATE OF BIRTH|GENDER)\b", following, re.I):
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

    name = _parse_aadhaar_name(lines)
    if name:
        fields["name"] = name

    date_of_birth = _parse_date(raw_text, marked_only=True)
    if date_of_birth:
        fields["date_of_birth"] = date_of_birth

    gender = re.search(r"\b(male|female|transgender)\b", raw_text, re.I)
    if gender:
        fields["gender"] = gender.group(1)

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
            and not re.search(_DATE, line)
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
