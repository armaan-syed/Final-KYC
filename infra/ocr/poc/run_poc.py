"""Run parser/OCR checks against locally generated synthetic documents."""

from __future__ import annotations

import argparse
import sys
import tempfile
import time
from pathlib import Path

from pramana_ocr.pipeline import extract_document_fields
from pramana_ocr.verification import compare_fields


EXPECTED_NORMALIZED = {
    "AADHAAR": {
        "name": "ARJUN DEMO",
        "date_of_birth": "2000-01-02",
        "gender": "male",
        "aadhaar_number": "123456789012",
    },
    "PAN": {
        "name": "ARJUN DEMO",
        "father_name": "RAVI DEMO",
        "date_of_birth": "2000-01-02",
        "pan_number": "ABCDE1234F",
    },
}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--fixtures-dir", type=Path)
    args = parser.parse_args()

    if args.fixtures_dir:
        fixtures = [args.fixtures_dir / name for name in (
            "synthetic-aadhaar.png", "synthetic-pan.png", "synthetic-aadhaar.pdf"
        )]
    else:
        from make_fixtures import create_fixtures

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
        expected = EXPECTED_NORMALIZED[document_type]
        normalized = {
            name: details.get("normalized_value")
            for name, details in fields.items()
        }
        comparison = compare_fields(expected, normalized, expected)
        # Never print OCR text or extracted values, even for synthetic fixtures.
        print(
            f"{document_type}: extracted keys={','.join(sorted(fields)) or '(none)'}; "
            f"comparison={comparison['overall_status']}; "
            f"match_percentage={comparison['match_percentage']}; "
            f"elapsed_seconds={elapsed:.2f}"
        )
        missing = expected.keys() - fields.keys()
        if missing:
            print(f"{document_type}: missing expected synthetic fixture fields: {','.join(sorted(missing))}", file=sys.stderr)
            return 1
        mismatched = sorted(
            name for name, value in expected.items()
            if normalized.get(name) != value
        )
        if mismatched:
            print(
                f"{document_type}: unexpected normalized fields: {','.join(mismatched)}",
                file=sys.stderr,
            )
            return 1
        if comparison["overall_status"] != "AUTO_VERIFIED" or comparison["match_percentage"] != 100.0:
            print(f"{document_type}: expected synthetic reference did not match", file=sys.stderr)
            return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
