# OCR runtime proof of concept

This is Person A's first implementation stage: verify that Python 3.12 on
Amazon Linux 2023, OpenCV image handling, PDF rendering, and Tesseract run
together before wiring the worker to Person B's database schema. Python 3.12
is selected for this OCR worker because its native Tesseract layer can use the
active Amazon Linux 2023 build path; Person B's backend remains on its assigned
Python runtime.

## Local checks

The pure parser and verification checks require only Python's standard library:

```bash
PYTHONPATH=infra/ocr/src python3 -m unittest discover -s infra/ocr/tests -v
```

To create synthetic, non-personal PNG fixtures and run actual OCR, build the
Lambda-compatible layer using Docker, then run:

```bash
bash infra/ocr/scripts/build_layer.sh
```

The script uses a pinned revision of the layer build recipe, compiles the
Tesseract binary for the Lambda runtime, adds English and Hindi trained data,
installs Python dependencies into the layer, then runs import, language-data,
and synthetic OCR checks in the Lambda Python 3.12 container. The POC prints
only field names and elapsed time. It does not print OCR text, document
identifiers, or extracted values. The fixture cards use invented names and
identifiers and must never be used as customer examples.

## Runtime proof status

The source checkout currently has no Docker daemon, SAM CLI, or system
Tesseract binary. Therefore the pure Python parsing/normalization/verification
tests can run locally, but the native Lambda runtime and real OCR checks cannot
be claimed complete yet. Enable Docker, then run the layer build script before
deployment.

`pramana_ocr.pipeline.extract_document_fields` connects OCR, parsing, and
normalization. It returns raw and normalized values in memory for a later
schema-aware persistence adapter; callers must not log or expose those values.

The production SQS handler, RDS writer, and notification adapter remain
dependent on the unresolved message/schema/notification contracts documented
in `implementation/PERSON_A_IMPLEMENTATION_PLAN.md`; this POC does not pretend
those integrations have been verified.
