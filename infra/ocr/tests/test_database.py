from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

from pramana_ocr.database import PostgresRepository
from pramana_ocr.worker import OCRJob


ATTEMPT_ID = "11111111-1111-4111-8111-111111111111"
CASE_ID = "22222222-2222-4222-8222-222222222222"
CUSTOMER_ID = "33333333-3333-4333-8333-333333333333"
BUCKET = "pramana-documents-test"
KEY = f"documents/{CUSTOMER_ID}/{ATTEMPT_ID}/document.pdf"


class FakeCursor:
    def __init__(self, connection):
        self.connection = connection
        self.row = None

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def execute(self, statement, parameters=None):
        compact = " ".join(statement.split())
        self.connection.statements.append((compact, parameters))
        if "FOR UPDATE OF a, c" in compact:
            self.row = (
                self.connection.status,
                CASE_ID,
                CUSTOMER_ID,
                BUCKET,
                KEY,
            )
        elif compact.startswith("UPDATE kyc_attempts"):
            self.connection.status = parameters[0]
        if self.connection.fail_on and self.connection.fail_on in compact:
            raise RuntimeError("database write failed")

    def fetchone(self):
        return self.row


class FakeConnection:
    def __init__(self, status="PROCESSING", fail_on=None):
        self.status = status
        self.fail_on = fail_on
        self.statements = []
        self.committed = False
        self.rolled_back = False
        self.closed = False

    def cursor(self):
        return FakeCursor(self)

    def __enter__(self):
        return self

    def __exit__(self, exc_type, *_args):
        self.committed = exc_type is None
        self.rolled_back = exc_type is not None
        return False

    def close(self):
        self.closed = True


def job():
    return OCRJob(
        kyc_attempt_id=ATTEMPT_ID,
        kyc_case_id=CASE_ID,
        customer_id=CUSTOMER_ID,
        s3_bucket=BUCKET,
        s3_key=KEY,
        document_type="PAN",
    )


def extracted():
    return {
        "name": {
            "raw_value": "Arjun Demo",
            "normalized_value": "ARJUN DEMO",
            "confidence": 92.0,
        },
        "date_of_birth": {
            "raw_value": "02/01/2000",
            "normalized_value": "2000-01-02",
            "confidence": 84.0,
        },
    }


def comparisons():
    return [
        {
            "field_name": "name",
            "customer_value": "ARJUN DEMO",
            "document_value": "ARJUN DEMO",
            "is_match": True,
        },
        {
            "field_name": "date_of_birth",
            "customer_value": "2000-01-02",
            "document_value": "2000-01-02",
            "is_match": True,
        },
    ]


class DatabaseRepositoryTests(unittest.TestCase):
    def repository(self, connection):
        repository = PostgresRepository(
            secret_arn="arn:aws:secretsmanager:us-east-1:123456789012:secret:db",
            database_name="pramana_kyc",
            secrets_client=Mock(),
        )
        repository._connect = Mock(return_value=connection)
        return repository

    def test_persists_result_in_one_transaction_and_redelivery_is_ignored(self):
        connection = FakeConnection()
        repository = self.repository(connection)
        kwargs = {
            "job": job(),
            "extracted_fields": extracted(),
            "comparisons": comparisons(),
            "status": "AUTO_VERIFIED",
            "match_percentage": 100.0,
        }

        self.assertTrue(repository.persist_result(**kwargs))
        self.assertTrue(connection.committed)
        self.assertFalse(connection.rolled_back)
        self.assertTrue(connection.closed)
        statements = [statement for statement, _ in connection.statements]
        self.assertTrue(any(statement.startswith("DELETE FROM extracted_fields") for statement in statements))
        self.assertTrue(any(statement.startswith("DELETE FROM field_comparisons") for statement in statements))
        extracted_inserts = [
            parameters
            for statement, parameters in connection.statements
            if statement.startswith("INSERT INTO extracted_fields")
        ]
        self.assertEqual([row[-1] for row in extracted_inserts], [92.0, 84.0])
        self.assertTrue(any(statement.startswith("INSERT INTO kyc_decisions") for statement in statements))
        self.assertTrue(any(statement.startswith("INSERT INTO audit_events") for statement in statements))

        connection.committed = False
        self.assertFalse(repository.persist_result(**kwargs))
        self.assertTrue(connection.committed)
        self.assertEqual(len(connection.statements), len(statements) + 1)

    def test_failed_write_rolls_back_without_completing_attempt(self):
        connection = FakeConnection(fail_on="INSERT INTO extracted_fields")
        repository = self.repository(connection)
        with self.assertRaisesRegex(RuntimeError, "database write failed"):
            repository.persist_result(
                job=job(),
                extracted_fields=extracted(),
                comparisons=comparisons(),
                status="AUTO_VERIFIED",
                match_percentage=100.0,
            )
        self.assertTrue(connection.rolled_back)
        self.assertNotEqual(connection.status, "AUTO_VERIFIED")

    def test_database_secret_is_cached_and_validated(self):
        client = Mock()
        client.get_secret_value.return_value = {
            "SecretString": '{"host":"db.internal","username":"worker","password":"secret"}'
        }
        repository = PostgresRepository(
            secret_arn="secret-arn", database_name="pramana_kyc", secrets_client=client
        )
        self.assertEqual(repository._get_secret()["host"], "db.internal")
        repository._get_secret()
        client.get_secret_value.assert_called_once_with(SecretId="secret-arn")

    def test_database_connection_requires_verified_rds_tls(self):
        with tempfile.TemporaryDirectory() as temporary_dir:
            ca_file = Path(temporary_dir) / "global-bundle.pem"
            ca_file.write_text("synthetic CA data")
            client = Mock()
            client.get_secret_value.return_value = {
                "SecretString": '{"host":"db.internal","username":"worker","password":"secret"}'
            }
            repository = PostgresRepository(
                secret_arn="secret-arn", database_name="pramana_kyc", secrets_client=client
            )
            connect = Mock(return_value=object())
            psycopg2 = SimpleNamespace(connect=connect)
            with patch.dict("os.environ", {"RDS_CA_BUNDLE": str(ca_file)}), patch.dict(
                sys.modules, {"psycopg2": psycopg2}
            ):
                repository._connect()
            options = connect.call_args.kwargs
            self.assertEqual(options["sslmode"], "verify-full")
            self.assertEqual(options["sslrootcert"], str(ca_file))
            self.assertEqual(options["connect_timeout"], 5)


if __name__ == "__main__":
    unittest.main()
