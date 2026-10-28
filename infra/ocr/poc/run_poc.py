"""Run parser/OCR checks against locally generated synthetic documents."""

from __future__ import annotations

import argparse
import sys
import tempfile
import time
from pathlib import Path

from make_fixtures import create_fixtures
from pramana_ocr.pipeline import extract_document_fields


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--fixtures-dir", type=Path)
    args = parser.parse_args()

    if args.fixtures_dir:
        fixtures = [args.fixtures_dir / name for name in (
            "synthetic-aadhaar.png", "synthetic-pan.png", "synthetic-aadhaar.pdf"
        )]
    else:
        with tempfile.TemporaryDirectory(prefix="pramana-ocr-poc-") as temporary_dir:
            fixtures = create_fixtures(Path(temporary_dir))
            return run_fixtures(fixtures)
    return run_fixtures(fixtures)


def run_fixtures(fixtures: list[Path]) -> int:
    document_types = ("AADHAAR", "PAN", "AADHAAR")
    for path, document_type in zip(fixtures, document_types, strict=True):
        content_type = {
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".png": "image/png",
            ".pdf": "application/pdf",
        }[path.suffix.lower()]
        start = time.perf_counter()
        fields = extract_document_fields(path.read_bytes(), content_type, document_type)
        elapsed = time.perf_counter() - start
        # Never print OCR text or extracted values, even for synthetic fixtures.
        print(
            f"{document_type}: extracted keys={','.join(sorted(fields)) or '(none)'}; "
            f"elapsed_seconds={elapsed:.2f}"
        )
        required = {"name", "date_of_birth"}
        if document_type == "AADHAAR":
            required |= {"gender", "aadhaar_number"}
        else:
            required.add("pan_number")
        missing = required - fields.keys()
        if missing:
            print(f"{document_type}: missing expected synthetic fixture fields: {','.join(sorted(missing))}", file=sys.stderr)
            return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
