from __future__ import annotations

import os
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
from uuid import uuid4

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

from app.models.audit import AuditEvent
from app.models.customer import Customer
from app.models.kyc import KYCAttempt, KYCCase, KYCDocument, KYCDecision
from app.models.verification import ExtractedField, FieldComparison
from app import database as database_module
from app.services.kyc_service import KYCService
from app.services import kyc_service


class FakeQuery:
    def __init__(self, result):
        self.result = result

    def filter_by(self, **_kwargs):
        return self

    def first(self):
        return self.result


class SubmitDB:
    def __init__(self, attempt):
        self.attempt = attempt
        self.events = []
        self.added = []

    def query(self, model):
        if model is KYCAttempt:
            return FakeQuery(self.attempt)
        if model is KYCDocument:
            return FakeQuery(None)
        raise AssertionError(f"unexpected query: {model}")

    def add(self, value):
        self.added.append(value)

    def flush(self):
        self.events.append("flush")

    def commit(self):
        self.events.append("commit")


class DecisionDB:
    def __init__(self, customer):
        self.customer = customer
        self.added = []
        self.commits = 0

    def query(self, model):
        if model is KYCDecision:
            return FakeQuery(None)
        if model is Customer:
            return FakeQuery(self.customer)
        raise AssertionError(f"unexpected query: {model}")

    def add(self, value):
        self.added.append(value)

    def flush(self):
        pass

    def commit(self):
        self.commits += 1


class KYCContractTests(unittest.TestCase):
    def test_submit_commits_database_rows_before_sqs_send(self):
        attempt_id = uuid4()
        case_id = uuid4()
        customer_id = uuid4()
        attempt = SimpleNamespace(
            id=attempt_id,
            kyc_case_id=case_id,
            attempt_number=1,
            document_type="PAN",
            status="PROCESSING",
            completed_at=None,
        )
        case = SimpleNamespace(id=case_id, customer_id=customer_id, status="PROCESSING")
        customer = SimpleNamespace(id=customer_id, cognito_sub="customer-sub")
        db = SubmitDB(attempt)
        service = KYCService(db)

        def enqueue(**_kwargs):
            db.events.append("enqueue")
            return "message-id"

        with patch.object(kyc_service, "enqueue_ocr_job", side_effect=enqueue):
            result = service.submit_kyc(
                customer=customer,
                case=case,
                attempt_id=attempt_id,
                document_type="PAN",
                file_name="identity.pdf",
                file_size_bytes=1234,
            )
        self.assertEqual(result.status, "PROCESSING")
        self.assertLess(db.events.index("commit"), db.events.index("enqueue"))

    def test_reupload_decision_maps_case_and_attempt_statuses_separately(self):
        customer = SimpleNamespace(
            phone_number="+15555550123",
            email="customer@example.test",
            full_name="Arjun Demo",
        )
        db = DecisionDB(customer)
        service = KYCService(db)
        attempt = SimpleNamespace(id=uuid4(), status="REVIEW_REQUIRED", completed_at=None)
        case = SimpleNamespace(id=uuid4(), customer_id=uuid4(), status="REVIEW_REQUIRED")
        reviewer = SimpleNamespace(cognito_sub="reviewer-sub")

        with patch.object(kyc_service, "send_email", return_value=True):
            result = service.record_decision(
                case=case,
                attempt=attempt,
                reviewer=reviewer,
                decision="REUPLOAD_REQUESTED",
                notes="Please upload a clearer image",
            )

        self.assertEqual(attempt.status, "REUPLOAD_REQUESTED")
        self.assertEqual(case.status, "REUPLOAD_PENDING")
        self.assertEqual(result["decision"], "REUPLOAD_REQUESTED")
        # Person B's service commits the decision, then appends delivery audit
        # results in a second transaction after the notification attempt.
        self.assertEqual(db.commits, 2)
        self.assertTrue(any(isinstance(value, AuditEvent) for value in db.added))

    def test_database_uses_secret_manager_and_verified_tls(self):
        secret_client = SimpleNamespace(
            get_secret_value=lambda **_kwargs: {
                "SecretString": (
                    '{"host":"db.internal","port":5432,"username":"kyc_user",'
                    '"password":"secret/with@chars","dbname":"pramana_kyc"}'
                )
            }
        )
        ca_file = Path(REPO_ROOT) / ".venv" / "synthetic-rds-ca.pem"
        ca_file.parent.mkdir(exist_ok=True)
        ca_file.write_text("synthetic test certificate")
        original_arn = database_module.settings.rds_secret_arn
        database_module.settings.rds_secret_arn = "arn:aws:secretsmanager:us-east-1:123456789012:secret:db"
        database_module._get_database_secret.cache_clear()
        try:
            with patch("app.database.boto3.client", return_value=secret_client), patch.dict(
                os.environ, {"RDS_CA_BUNDLE": str(ca_file)}
            ):
                url, connect_args = database_module.get_database_config()
        finally:
            database_module.settings.rds_secret_arn = original_arn
            database_module._get_database_secret.cache_clear()
            ca_file.unlink(missing_ok=True)

        self.assertEqual(url.host, "db.internal")
        self.assertEqual(url.username, "kyc_user")
        self.assertEqual(url.password, "secret/with@chars")
        self.assertEqual(connect_args["sslmode"], "verify-full")
        self.assertEqual(connect_args["sslrootcert"], str(ca_file))


if __name__ == "__main__":
    unittest.main()
