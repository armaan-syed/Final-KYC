"""Lambda-compatible image preparation and Tesseract invocation."""

from __future__ import annotations

import os
from collections.abc import Iterator
from pathlib import Path
from typing import Any

from .limits import MAX_PDF_PAGES


_PANEL_LINE_MIN_RATIO = 0.38
_PANEL_UPSCALE_TARGET = 1440
_PANEL_MAX_SCALE = 4.0


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
    """Apply the existing denoise and adaptive threshold pass."""
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


def _separator_coordinate(image: object, *, horizontal: bool) -> int | None:
    """Find a long internal divider that separates panels in a scanned page."""
    cv2, np, _ = _imports()
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    height, width = gray.shape[:2]
    binary = cv2.threshold(
        gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU
    )[1]

    if horizontal:
        kernel = cv2.getStructuringElement(
            cv2.MORPH_RECT, (max(25, int(width * 0.25)), 1)
        )
        opened = cv2.morphologyEx(binary, cv2.MORPH_OPEN, kernel)
        projection = np.count_nonzero(opened, axis=1)
        limit = width
        lower, upper = int(height * 0.30), int(height * 0.90)
    else:
        kernel = cv2.getStructuringElement(
            cv2.MORPH_RECT, (1, max(25, int(height * 0.25)))
        )
        opened = cv2.morphologyEx(binary, cv2.MORPH_OPEN, kernel)
        projection = np.count_nonzero(opened, axis=0)
        limit = height
        lower, upper = int(width * 0.20), int(width * 0.80)

    if lower >= upper:
        return None

    coordinates = np.arange(len(projection))
    candidates = np.where(
        (projection >= limit * _PANEL_LINE_MIN_RATIO)
        & (coordinates >= lower)
        & (coordinates <= upper)
    )[0]
    if not len(candidates):
        return None

    groups = np.split(candidates, np.where(np.diff(candidates) > 2)[0] + 1)
    groups = [group for group in groups if len(group)]
    if not groups:
        return None
    strongest = max(groups, key=lambda group: int(projection[group].max()))
    return int(np.median(strongest))


def detect_panel_regions(image: object) -> list[object]:
    """Split scans at long interior rules while retaining the original page OCR.

    The full page remains part of the OCR result. Cropped panels are an
    additional pass for composite scans, so a false-positive divider cannot
    discard text from the original image.
    """
    cv2, _, _ = _imports()
    height, width = image.shape[:2]
    if height < 100 or width < 100:
        return []

    horizontal = _separator_coordinate(image, horizontal=True)
    vertical = _separator_coordinate(image, horizontal=False)
    if horizontal is None and vertical is None:
        return []

    x_overlap = max(2, int(width * 0.01))
    y_overlap = max(2, int(height * 0.01))
    x_ranges = (
        [(0, min(width, vertical + x_overlap)), (max(0, vertical - x_overlap), width)]
        if vertical is not None
        else [(0, width)]
    )
    y_ranges = (
        [(0, min(height, horizontal + y_overlap)), (max(0, horizontal - y_overlap), height)]
        if horizontal is not None
        else [(0, height)]
    )

    regions = []
    for y_start, y_end in y_ranges:
        for x_start, x_end in x_ranges:
            region = image[y_start:y_end, x_start:x_end]
            if region.shape[0] >= 80 and region.shape[1] >= 80:
                regions.append(region)
    return regions


def _image_to_text_and_confidence(
    image: object,
    *,
    language: str,
    page_segmentation_mode: int,
) -> tuple[str, list[tuple[str, float | None]]]:
    _, _, pytesseract = _imports()
    result: dict[str, Any] = pytesseract.image_to_data(
        image,
        lang=language,
        config=f"--oem 3 --psm {page_segmentation_mode}",
        output_type=pytesseract.Output.DICT,
    )
    lines: dict[tuple[int, int, int], list[str]] = {}
    confidence_words: list[tuple[str, float | None]] = []
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
        confidence_words.append(
            (word, confidence if confidence is None or confidence >= 0 else None)
        )
    text = "\n".join(" ".join(words) for words in lines.values())
    return text, confidence_words


def _enhance_panel(image: object) -> object:
    """Upscale a panel and improve local contrast without hard thresholding."""
    cv2, _, _ = _imports()
    height, width = image.shape[:2]
    scale = min(_PANEL_MAX_SCALE, _PANEL_UPSCALE_TARGET / max(height, width))
    if scale > 1.0:
        image = cv2.resize(
            image, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC
        )
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    return cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply(gray)


def extract_text_with_confidence(
    document_bytes: bytes, content_type: str, document_type: str
) -> tuple[str, list[tuple[str, float | None]]]:
    """Return OCR text and Tesseract confidence for full pages and detected panels."""
    _, _, _ = _imports()
    language = "eng+hin" if document_type.upper() == "AADHAAR" else "eng"
    pages: list[str] = []
    confidence_words: list[tuple[str, float | None]] = []

    for image in render_pages(document_bytes, content_type):
        full_text, full_confidence = _image_to_text_and_confidence(
            preprocess(image), language=language, page_segmentation_mode=6
        )
        pages.append(full_text)
        confidence_words.extend(full_confidence)

        for panel in detect_panel_regions(image):
            panel_text, panel_confidence = _image_to_text_and_confidence(
                _enhance_panel(panel), language="eng", page_segmentation_mode=6
            )
            pages.append(panel_text)
            confidence_words.extend(panel_confidence)

    return "\n".join(pages), confidence_words


def extract_text(document_bytes: bytes, content_type: str, document_type: str) -> str:
    """Compatibility helper returning only recognized text."""
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
