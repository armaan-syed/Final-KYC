from __future__ import annotations

import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "backend"))
sys.path.insert(0, str(REPO_ROOT / "infra" / "shared" / "python"))

os.environ.setdefault("AWS_REGION", "us-east-1")
os.environ.setdefault("COGNITO_CUSTOMER_POOL_ID", "us-east-1_customer")
os.environ.setdefault("COGNITO_REVIEWER_POOL_ID", "us-east-1_reviewer")
os.environ.setdefault("COGNITO_APP_CLIENT_ID", "customer-client")
os.environ.setdefault("COGNITO_REVIEWER_APP_CLIENT_ID", "reviewer-client")
os.environ.setdefault("S3_DOCUMENTS_BUCKET", "pramana-documents-test")
os.environ.setdefault("SQS_QUEUE_URL", "https://sqs.us-east-1.amazonaws.com/123456789012/pramana-ocr")

from app.services.s3 import inspect_uploaded_document


class UploadMetadataTests(unittest.TestCase):
    def test_reads_authoritative_upload_size_and_type(self):
        with patch(
            "app.services.s3.s3_client.head_object",
            return_value={"ContentLength": 1234, "ContentType": "application/pdf"},
        ) as head:
            result = inspect_uploaded_document(
                "documents/customer/attempt/id.pdf", s3_bucket="pramana-documents-test"
            )
        self.assertEqual(result, {"content_length": 1234, "content_type": "application/pdf"})
        head.assert_called_once_with(
            Bucket="pramana-documents-test", Key="documents/customer/attempt/id.pdf"
        )

    def test_rejects_upload_over_10_mib(self):
        from pramana_limits import MAX_DOCUMENT_BYTES

        with patch(
            "app.services.s3.s3_client.head_object",
            return_value={"ContentLength": MAX_DOCUMENT_BYTES + 1, "ContentType": "image/jpeg"},
        ), self.assertRaises(HTTPException) as raised:
            inspect_uploaded_document("documents/customer/attempt/id.jpg")
        self.assertEqual(raised.exception.status_code, 413)

    def test_rejects_non_supported_upload_type(self):
        with patch(
            "app.services.s3.s3_client.head_object",
            return_value={"ContentLength": 100, "ContentType": "text/plain"},
        ), self.assertRaises(HTTPException) as raised:
            inspect_uploaded_document("documents/customer/attempt/id.txt")
        self.assertEqual(raised.exception.status_code, 415)
