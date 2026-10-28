"""Lambda-compatible image preparation and Tesseract invocation."""

from __future__ import annotations

import os
from collections.abc import Iterator
from pathlib import Path
from typing import Any

from .limits import MAX_PDF_PAGES


def _imports():
    try:
        import cv2
        import numpy as np
        import pytesseract
    except ImportError as exc:
        raise RuntimeError("OCR runtime dependencies are missing; build the Lambda layer first") from exc
    pytesseract.pytesseract.tesseract_cmd = os.environ.get("TESSERACT_CMD", "tesseract")
    return cv2, np, pytesseract


def render_pages(document_bytes: bytes, content_type: str) -> Iterator[object]:
    """Yield decoded image pages from JPEG/PNG or a bounded PDF."""
    cv2, np, _ = _imports()
    normalized_type = content_type.split(";", 1)[0].strip().lower()

    if normalized_type == "application/pdf":
        try:
            import pypdfium2 as pdfium
        except ImportError as exc:
            raise RuntimeError("PDF rendering dependency is missing from the Lambda layer") from exc
        pdf = pdfium.PdfDocument(document_bytes)
        try:
            if len(pdf) > MAX_PDF_PAGES:
                raise ValueError(f"PDF must contain no more than {MAX_PDF_PAGES} pages")
            for page in pdf:
                bitmap = page.render(scale=2)
                image = np.asarray(bitmap.to_numpy()).copy()
                if image.ndim != 3 or image.shape[2] < 3:
                    raise ValueError("could not decode a PDF page")
                yield image[:, :, :3]
        finally:
            pdf.close()
        return

    if normalized_type not in {"image/jpeg", "image/png"}:
        raise ValueError("content_type must be image/jpeg, image/png, or application/pdf")
    image = cv2.imdecode(np.frombuffer(document_bytes, dtype=np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("could not decode image")
    yield image


def preprocess(image: object) -> object:
    cv2, _, _ = _imports()
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    denoised = cv2.fastNlMeansDenoising(gray, h=10)
    return cv2.adaptiveThreshold(
        denoised,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY,
        11,
        2,
    )


def extract_text_with_confidence(
    document_bytes: bytes, content_type: str, document_type: str
) -> tuple[str, list[tuple[str, float | None]]]:
    """Return OCR text plus Tesseract's confidence for each recognized word."""
    _, _, pytesseract = _imports()
    language = "eng+hin" if document_type.upper() == "AADHAAR" else "eng"
    pages: list[str] = []
    confidence_words: list[tuple[str, float | None]] = []
    for image in render_pages(document_bytes, content_type):
        result: dict[str, Any] = pytesseract.image_to_data(
            preprocess(image),
            lang=language,
            config="--oem 3 --psm 6",
            output_type=pytesseract.Output.DICT,
        )
        lines: dict[tuple[int, int, int], list[str]] = {}
        for index, raw_word in enumerate(result.get("text", [])):
            word = str(raw_word).strip()
            if not word:
                continue
            line_id = (
                int(result["block_num"][index]),
                int(result["par_num"][index]),
                int(result["line_num"][index]),
            )
            lines.setdefault(line_id, []).append(word)
            try:
                confidence = float(result["conf"][index])
            except (KeyError, TypeError, ValueError, IndexError):
                confidence = None
            confidence_words.append((word, confidence if confidence is None or confidence >= 0 else None))
        pages.append("\n".join(" ".join(words) for words in lines.values()))
    return "\n".join(pages), confidence_words


def extract_text(document_bytes: bytes, content_type: str, document_type: str) -> str:
    """Compatibility helper returning only the recognized text."""
    return extract_text_with_confidence(document_bytes, content_type, document_type)[0]


def extract_text_from_file(path: str, document_type: str) -> str:
    """Local POC helper; reads only the explicitly supplied test file."""
    suffix = Path(path).suffix.lower()
    content_type = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".pdf": "application/pdf",
    }.get(suffix)
    if content_type is None:
        raise ValueError("file extension must be JPG, PNG, or PDF")
    with open(path, "rb") as document:
        return extract_text(document.read(), content_type, document_type)
