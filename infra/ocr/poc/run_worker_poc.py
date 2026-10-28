"""Exercise the production worker path with synthetic inputs and fake I/O."""

from __future__ import annotations

import argparse
import io
import sys
import time
from pathlib import Path
from typing import Any

from pramana_ocr.worker import AttemptContext, OCRJob, process_job


BUCKET = "pramana-synthetic-documents"
CUSTOMER_ID = "33333333-3333-4333-8333-333333333333"
CASE_ID = "22222222-2222-4222-8222-222222222222"


class _FakeS3:
    def __init__(self, content: bytes, content_type: str):
        self.content = content
        self.content_type = content_type

    def get_object(self, *, Bucket: str, Key: str) -> dict[str, Any]:
        if Bucket != BUCKET or not Key.startswith(f"documents/{CUSTOMER_ID}/"):
            raise AssertionError("worker requested an unexpected synthetic object")
        return {"Body": io.BytesIO(self.content), "ContentType": self.content_type}


class _FakeRepository:
    def __init__(self, context: AttemptContext):
        self.context = context
        self.persisted: list[dict[str, Any]] = []

    def get_context(self, _job: OCRJob) -> AttemptContext:
        return self.context

    def persist_result(self, **result: Any) -> bool:
        self.persisted.append(result)
        return True


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--fixtures-dir", required=True, type=Path)
    args = parser.parse_args()

    cases = (
        ("synthetic-aadhaar.png", "AADHAAR", "image/png"),
        ("synthetic-pan.png", "PAN", "image/png"),
        ("synthetic-aadhaar.pdf", "AADHAAR", "application/pdf"),
    )
    customer_fields = {
        "AADHAAR": {"name": "ARJUN DEMO", "date_of_birth": "2000-01-02", "gender": "male"},
        "PAN": {"name": "ARJUN DEMO", "date_of_birth": "2000-01-02"},
    }

    for index, (filename, document_type, content_type) in enumerate(cases, start=1):
        attempt_id = f"11111111-1111-4111-8111-{index:012d}"
        key = f"documents/{CUSTOMER_ID}/{attempt_id}/{filename}"
        job = OCRJob(attempt_id, CASE_ID, CUSTOMER_ID, BUCKET, key, document_type)
        context = AttemptContext(
            status="PROCESSING",
            document_type=document_type,
            s3_bucket=BUCKET,
            s3_key=key,
            customer_fields=customer_fields[document_type],
            customer_email="synthetic@example.test",
            customer_phone="+15555550123",
            customer_name="Synthetic Customer",
        )
        repository = _FakeRepository(context)
        start = time.perf_counter()
        result = process_job(
            job,
            s3_client=_FakeS3((args.fixtures_dir / filename).read_bytes(), content_type),
            repository=repository,
            notifier=lambda _context, _case_id: True,
        )
        elapsed = time.perf_counter() - start

        if result != "AUTO_VERIFIED" or len(repository.persisted) != 1:
            print(f"{document_type} worker path failed", file=sys.stderr)
            return 1
        stored = repository.persisted[0]
        if stored["status"] != "AUTO_VERIFIED" or stored["match_percentage"] != 100.0:
            print(f"{document_type} worker result did not match expected status", file=sys.stderr)
            return 1
        name_confidence = stored["extracted_fields"].get("name", {}).get("confidence")
        if not isinstance(name_confidence, (int, float)) or not 0 <= name_confidence <= 100:
            print(f"{document_type} worker did not persist Tesseract name confidence", file=sys.stderr)
            return 1
        print(
            f"{document_type} {content_type}: worker=ok; "
            f"status=AUTO_VERIFIED; match_percentage=100.0; "
            f"name_confidence={name_confidence:.2f}; elapsed_seconds={elapsed:.2f}"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
