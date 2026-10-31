# OCR Lambda worker

Person A's OCR component uses Python 3.12 on Amazon Linux 2023 x86_64. The Lambda layer contains Tesseract, English/Hindi language data, OpenCV, PDFium, and the native libraries required by the OCR pipeline. The worker accepts JPEG, PNG, and PDF objects from the private S3 bucket, extracts Aadhaar/PAN fields, normalizes and compares the required fields, writes its result transactionally to Person B's PostgreSQL schema, and reports failed SQS records for retry.

## Local tests

```bash
PYTHONPATH=infra/ocr/src:infra/shared/python \
  python3 -m unittest discover -s infra/ocr/tests -v
```

This covers parser/normalization, queue contract validation, worker behavior, database transaction/idempotency logic, and notification behavior. The PostgreSQL integration test is skipped unless `PRAMANA_TEST_DATABASE_URL` points to a dedicated database with Person B's Alembic migration applied:

```bash
PRAMANA_TEST_DATABASE_URL='postgresql://…' \
PYTHONPATH=infra/ocr/src:infra/shared/python \
  python3 -m unittest discover -s infra/ocr/tests -p 'test_postgres_integration.py' -v
```

The test only uses synthetic rows and deletes them after the test. Use a disposable database.

## Lambda-compatible build proof

Run:

```bash
infra/ocr/scripts/build_layer.sh
```

The script builds the pinned Tesseract/Leptonica sources for Amazon Linux 2023, downloads the RDS CA bundle, installs pinned Python dependencies inside the Python 3.12 Lambda image, and checks native libraries, language data, writable `/tmp`, imports, and combined function/layer size. It then executes both the original OCR pipeline proof and `process_job` itself using synthetic Aadhaar PNG, PAN PNG, and Aadhaar PDF inputs with fake S3/database/notification I/O. Output includes only document type, result status, match percentage, elapsed time, and package sizes; it does not print OCR text or extracted values.

Latest build proof (2026-10-29): Python 3.12.15 x86_64; Tesseract 5.5.2; Leptonica 1.87.0; OpenCV 5.0.0; NumPy 2.5.4; PDFium 5.14.0; psycopg2 2.9.10. Synthetic Aadhaar PNG (0.73s), PAN PNG (0.33s), and Aadhaar PDF (0.37s) all traversed the actual worker, matched at 100%, persisted name confidence values from 95 to 96, and passed. The layer ZIP is 93,834,078 bytes; uncompressed layer contents are 250,219,932 bytes; function code plus all layers are 258,176,462 bytes against the 262,144,000-byte quota. This leaves only 3,967,538 bytes of headroom; recheck after every packaging/dependency change. Because the ZIP is over 50 MiB, stage it through S3 for deployment.

## Current worker contract

- Queue: standard SQS, produced only by Person B's `POST /kyc/submit` path.
- Required fields: `kyc_attempt_id`, `kyc_case_id`, `customer_id`, `s3_bucket`, `s3_key`, and `document_type`.
- Key: `documents/{customer_id}/{attempt_id}/{file_name}`. The worker checks the configured bucket and key shape, then verifies the saved document row before downloading.
- Comparison: Aadhaar name/date of birth/gender; PAN name/date of birth. Identifiers and Aadhaar address are stored but not compared.
- Persistence: extraction (including mapped Tesseract confidence from 0–100 where available), comparisons, attempt/case state, auto-decision, and audit event are committed together. A row lock prevents duplicate result writes. Notification is attempted after the commit.
- Failure behavior: database/S3/OCR exceptions return the affected message for SQS retry and eventual DLQ routing. On the third failed receive, a valid attempt is atomically moved to `REVIEW_REQUIRED` with a `REVIEW_REQUIRED` audit event; the record remains failed so SQS can deliver it to the DLQ. If RDS is unavailable, the state write can fail and the message remains for operator investigation/redrive. A completed attempt is ignored on redelivery. Notification failure does not roll back the committed verification.

## Multi-panel extraction and comparison states

The worker OCRs each complete page as before, then looks for long internal horizontal/vertical rules and makes overlapping panel crops. Panel crops are enlarged (up to 4x), converted to grayscale, and locally contrast-enhanced before an English Tesseract pass. Full-page OCR is retained so a mistaken divider cannot remove recognized text. No test-image values or customer-specific branches are used.

DOB parsing is label-first for Aadhaar (`DOB`, `D.O.B`, `Date of Birth`, `Birth Date`, and the supported Hindi labels); PAN accepts an unlabelled date only when exactly one plausible date is present. Slash, hyphen, dot, and ISO forms normalize to `YYYY-MM-DD`; invalid, future, and implausibly old dates are discarded. OCR `O`/`I` digit substitutions are corrected only inside date candidates. Gender is read from a gender/sex label, a standalone value, or a unique full gender word on a short OCR line. Single-letter `M`/`F` requires a label or standalone line; gender is never inferred from a name. Normalized values are `MALE`, `FEMALE`, `OTHER`, or explicit `UNKNOWN`.

Comparisons carry `MATCH`, `MISMATCH`, or `NOT_EXTRACTED`; `NOT_APPLICABLE` is rendered for PAN gender. The PostgreSQL schema remains unchanged: `document_value IS NULL` represents an unextracted value and the legacy `is_match` boolean remains for compatibility. The reviewer portal derives its display state from those persisted fields, shows missing OCR as amber `NOT EXTRACTED`, and reserves `MISMATCH` for a non-empty unequal value. The customer history page labels a false boolean neutrally as `Needs Review` because its API response intentionally does not contain either compared value.

## Current deployed state — 2026-10-31

The shared `pramana-dev-foundation` stack is `UPDATE_COMPLETE`. The Python 3.12 x86_64 worker is `Active`, uses OCR layer v4/shared layer v7, and its SQS event-source mapping is enabled. Change set `pramana-ocr-20261031-worker-code-v2` updated only the Lambda code in place; it changed no IAM, layer, networking, queue, database, bucket, or CloudFront resource. The function package was assembled with the existing validated Python 3.12 `psycopg2` runtime dependency and checked in the Lambda runtime image. Combined function/layer size remains within the previously measured 262,144,000-byte unzipped quota; remeasure if dependencies change.

The user-provided multi-panel JPEG was run locally in the same Python 3.12 runtime with the deployed OCR layer and the exact newly deployed source package. It returned name, DOB, and gender fields with Tesseract confidence; only sanitized presence/canonical-format indicators were recorded. The same JPEG was uploaded again through Cognito-authenticated API → presigned S3 PUT → `POST /kyc/submit`; the live worker completed and persisted name/DOB/gender comparison rows as `REVIEW_REQUIRED`. The synthetic profile produced three false match flags. To classify these without exposing values, the exact same image was run through the same runtime package and its normalized fields were compared in memory with the authenticated synthetic profile: all three fields were present and each comparison was a genuine `MISMATCH`, matching the live flags. The customer API did not expose document values, so the stored values themselves were not read through the reviewer endpoint in this run.

Frontend status handling was uploaded to the existing private S3 origin and CloudFront invalidation `I61VQF7LF5QPTI0TEQ4K1KDNB6` completed. The live index and JavaScript bundle return HTTP 200, include the missing-field explanation and status logic, and the API preflight from the CloudFront origin returns HTTP 200 with the matching allow-origin header. Current local checks: OCR **45 passed, 1 skipped** with the database integration tests against a disposable migrated PostgreSQL 16 container; the skipped host-only panel test passed separately in the Python 3.12 Lambda-compatible runtime. Backend **36 passed**; frontend **19 passed** and production build passed with the existing non-fatal bundle/dependency warnings. The local PostgreSQL container and temporary test credentials were removed. Real email/SMS delivery remains separately unverified as documented in the implementation plan.
