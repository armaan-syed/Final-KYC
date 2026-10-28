from __future__ import annotations

import json
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

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

from app.services.sqs import enqueue_ocr_job


class SQSContractTests(unittest.TestCase):
    def test_standard_queue_message_matches_worker_contract(self):
        with patch("app.services.sqs.sqs_client.send_message", return_value={"MessageId": "message-id"}) as send:
            result = enqueue_ocr_job(
                kyc_attempt_id="11111111-1111-4111-8111-111111111111",
                kyc_case_id="22222222-2222-4222-8222-222222222222",
                customer_id="33333333-3333-4333-8333-333333333333",
                s3_bucket="pramana-documents-test",
                s3_key="documents/33333333-3333-4333-8333-333333333333/11111111-1111-4111-8111-111111111111/id.pdf",
                document_type="AADHAAR",
            )
        self.assertEqual(result, "message-id")
        request = send.call_args.kwargs
        self.assertEqual(set(request), {"QueueUrl", "MessageBody"})
        self.assertEqual(
            set(json.loads(request["MessageBody"])),
            {"kyc_attempt_id", "kyc_case_id", "customer_id", "s3_bucket", "s3_key", "document_type"},
        )


if __name__ == "__main__":
    unittest.main()
