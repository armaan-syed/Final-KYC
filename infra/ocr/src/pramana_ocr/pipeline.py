"""OCR-to-field pipeline, kept independent of database and queue contracts."""

from __future__ import annotations

import re
from collections.abc import Callable

from .normalization import normalize_value
from .parser import PARSERS, parse_document

TextRecognizer = Callable[[bytes, str, str], str]
ConfidenceRecognizer = Callable[
    [bytes, str, str], tuple[str, list[tuple[str, float | None]]]
]


def _field_confidence(
    raw_value: str, confidence_words: list[tuple[str, float | None]]
) -> float | None:
    """Average word confidence only when the parsed value maps to OCR words."""
    target = re.findall(r"\w+", raw_value.casefold())
    if not target:
        return None

    source: list[tuple[str, float | None]] = []
    for word, confidence in confidence_words:
        source.extend(
            (token, confidence) for token in re.findall(r"\w+", word.casefold())
        )
    width = len(target)
    for start in range(len(source) - width + 1):
        matched = source[start : start + width]
        if [token for token, _ in matched] == target:
            scores = [score for _, score in matched if score is not None]
            if scores:
                return round(sum(scores) / len(scores), 2)
            return None
    return None


def extract_document_fields(
    document_bytes: bytes,
    content_type: str,
    document_type: str,
    *,
    recognize_text: TextRecognizer | None = None,
    recognize_text_with_confidence: ConfidenceRecognizer | None = None,
) -> dict[str, dict[str, str | float | None]]:
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

    if recognize_text is not None and recognize_text_with_confidence is not None:
        raise ValueError("provide only one text recognizer")
    confidence_words: list[tuple[str, float | None]] = []
    if recognize_text_with_confidence is not None:
        raw_text, confidence_words = recognize_text_with_confidence(
            document_bytes, content_type, normalized_type
        )
    elif recognize_text is not None:
        raw_text = recognize_text(document_bytes, content_type, normalized_type)
    else:
        from .imaging import extract_text_with_confidence

        raw_text, confidence_words = extract_text_with_confidence(
            document_bytes, content_type, normalized_type
        )
    if not isinstance(raw_text, str):
        raise TypeError("text recognizer must return a string")

    extracted = parse_document(normalized_type, raw_text)
    return {
        field_name: {
            "raw_value": raw_value,
            "normalized_value": normalize_value(field_name, raw_value),
            "confidence": _field_confidence(raw_value, confidence_words),
        }
        for field_name, raw_value in extracted.items()
    }
