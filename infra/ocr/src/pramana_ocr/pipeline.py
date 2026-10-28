"""OCR-to-field pipeline, kept independent of database and queue contracts."""

from __future__ import annotations

from collections.abc import Callable

from .normalization import normalize_value
from .parser import PARSERS, parse_document

TextRecognizer = Callable[[bytes, str, str], str]


def extract_document_fields(
    document_bytes: bytes,
    content_type: str,
    document_type: str,
    *,
    recognize_text: TextRecognizer | None = None,
) -> dict[str, dict[str, str | None]]:
    """Return raw and normalized extracted values without logging document data.

    A recognizer can be injected for deterministic tests. Production calls use
    the Lambda-compatible OpenCV/Tesseract implementation in ``imaging``.
    Persistence and comparison-field selection stay outside this function
    until Person B's database and verification contracts are finalized.
    """
    normalized_type = document_type.upper()
    if normalized_type not in PARSERS:
        raise ValueError("document_type must be AADHAAR or PAN")
    if not isinstance(document_bytes, bytes) or not document_bytes:
        raise ValueError("document_bytes must contain the uploaded document")
    if not content_type or not content_type.strip():
        raise ValueError("content_type is required")

    if recognize_text is None:
        from .imaging import extract_text

        recognize_text = extract_text

    raw_text = recognize_text(document_bytes, content_type, normalized_type)
    if not isinstance(raw_text, str):
        raise TypeError("text recognizer must return a string")

    extracted = parse_document(normalized_type, raw_text)
    return {
        field_name: {
            "raw_value": raw_value,
            "normalized_value": normalize_value(field_name, raw_value),
        }
        for field_name, raw_value in extracted.items()
    }
