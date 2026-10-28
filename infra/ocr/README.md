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

Phase 1 was completed on 2026-10-28 with rootless Docker, using the
`public.ecr.aws/lambda/python:3.12` x86_64 runtime container. The build uses
Tesseract 5.5.2, Leptonica 1.87.0, `opencv-python-headless` 5.0.0.93, NumPy
2.5.4, pytesseract 0.3.13, pypdfium2 5.14.0, Pillow 13.0.0, and packaging
26.3. The layer contains the English and Hindi trained data; the unused OSD
model is excluded to preserve the Lambda size budget. The build script defaults
to PyPI and accepts `PIP_INDEX_URL` to select a package index mirror.

The successful build produced a 93,751,918-byte ZIP (89.4 MiB) with
250,045,372 bytes uncompressed (238.4 MiB). The layer is below Lambda's 250 MiB
uncompressed limit. Its ZIP is above the 50 MB direct-upload limit, so publish
it through S3. The function package and every attached layer share the
uncompressed size quota, so include the eventual worker code when sizing a
deployment.

The Lambda-compatible container check confirmed Python 3.12.15/x86_64,
OpenCV/NumPy/PDFium/pytesseract imports, Tesseract 5.5.2 startup, no missing
Tesseract shared libraries, English/Hindi language data, and writable `/tmp`.
The synthetic Aadhaar PNG, PAN PNG, and Aadhaar PDF each produced the expected
normalized comparison with `AUTO_VERIFIED` at 100%. OCR elapsed times were
0.65 s, 0.30 s, and 0.34 s respectively. The existing pure-Python suite also
passed 12/12 tests. These checks ran locally in the Lambda runtime image; no
AWS resources were deployed.

`pramana_ocr.pipeline.extract_document_fields` connects OCR, parsing, and
normalization. It returns raw and normalized values in memory for a later
schema-aware persistence adapter; callers must not log or expose those values.

The production SQS handler, RDS writer, and notification adapter remain
dependent on the unresolved message/schema/notification contracts documented
in `implementation/PERSON_A_IMPLEMENTATION_PLAN.md`; this POC does not pretend
those integrations have been verified.
