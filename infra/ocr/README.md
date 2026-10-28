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
- Failure behavior: database/S3/OCR exceptions return the affected message for SQS retry and eventual DLQ routing. If a document-processing exception occurs, the attempt may remain `PROCESSING`; the operator/review recovery transition still needs agreement with B/C. A completed attempt is ignored on redelivery. Notification failure does not roll back the committed verification.

The worker is disabled in the SAM template until Person B provides the DB secret ARN and SES identity. No AWS resources are deployed; local and mocked checks are not AWS integration evidence.
