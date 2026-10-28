"""Shared upload and OCR processing limits for the API, worker, and UI contract."""

MAX_DOCUMENT_BYTES = 10 * 1024 * 1024
MAX_PDF_PAGES = 3
ALLOWED_DOCUMENT_CONTENT_TYPES = frozenset(
    {"image/jpeg", "image/png", "application/pdf"}
)
