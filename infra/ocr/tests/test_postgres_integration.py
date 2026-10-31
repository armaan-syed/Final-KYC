"""Opt-in SQL integration test for a migrated disposable PostgreSQL database.

Set PRAMANA_TEST_DATABASE_URL only to a dedicated test database with the
backend Alembic migration already applied. The test creates and removes its
own rows, identified by fresh UUIDs.
"""

from __future__ import annotations

import os
import unittest
from uuid import uuid4

import psycopg2

from pramana_ocr.database import PostgresRepository
from pramana_ocr.worker import OCRJob


DATABASE_URL = os.environ.get("PRAMANA_TEST_DATABASE_URL")


@unittest.skipUnless(DATABASE_URL, "set PRAMANA_TEST_DATABASE_URL for PostgreSQL integration")
class PostgreSQLWorkerIntegrationTests(unittest.TestCase):
    def setUp(self):
        self.customer_id = str(uuid4())
        self.case_id = str(uuid4())
        self.attempt_id = str(uuid4())
        self.bucket = "pramana-test-documents"
        self.key = f"documents/{self.customer_id}/{self.attempt_id}/synthetic.png"
        self.job = OCRJob(
            kyc_attempt_id=self.attempt_id,
            kyc_case_id=self.case_id,
            customer_id=self.customer_id,
            s3_bucket=self.bucket,
            s3_key=self.key,
            document_type="PAN",
        )

        connection = psycopg2.connect(DATABASE_URL)
        try:
            with connection:
                with connection.cursor() as cursor:
                    cursor.execute(
                        """
                        INSERT INTO customers (
                            id, cognito_sub, full_name, date_of_birth, gender,
                            phone_number, email, address_line1, city, state, pincode
                        ) VALUES (%s, %s, 'Arjun Demo', '2000-01-02', 'Male',
                                  '+15555550123', %s, '1 Example Road', 'Test City',
                                  'Test State', '00000')
                        """,
                        (self.customer_id, f"test-{self.customer_id}", f"{self.customer_id}@example.test"),
                    )
                    cursor.execute(
                        "INSERT INTO kyc_cases (id, customer_id, status) VALUES (%s, %s, 'PROCESSING')",
                        (self.case_id, self.customer_id),
                    )
                    cursor.execute(
                        """
                        INSERT INTO kyc_attempts (
                            id, kyc_case_id, attempt_number, document_type, status
                        ) VALUES (%s, %s, 1, 'PAN', 'PROCESSING')
                        """,
                        (self.attempt_id, self.case_id),
                    )
                    cursor.execute(
                        """
                        INSERT INTO kyc_documents (
                            attempt_id, s3_bucket, s3_key, file_name, content_type
                        ) VALUES (%s, %s, %s, 'synthetic.png', 'image/png')
                        """,
                        (self.attempt_id, self.bucket, self.key),
                    )
        finally:
            connection.close()

        self.repository = PostgresRepository(
            secret_arn="local-test-only",
            database_name="pramana_test",
            secrets_client=object(),
        )
        self.repository._connect = lambda: psycopg2.connect(DATABASE_URL)

    def tearDown(self):
        connection = psycopg2.connect(DATABASE_URL)
        try:
            with connection:
                with connection.cursor() as cursor:
                    cursor.execute("DELETE FROM customers WHERE id = %s", (self.customer_id,))
        finally:
            connection.close()

    def test_auto_verification_persists_schema_and_redelivery_once(self):
        context = self.repository.get_context(self.job)
        self.assertEqual(context.status, "PROCESSING")
        self.assertEqual(context.document_type, "PAN")
        self.assertEqual(context.customer_fields["date_of_birth"], "2000-01-02")

        result = {
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
            "pan_number": {
                "raw_value": "ABCDE1234F",
                "normalized_value": "ABCDE1234F",
                "confidence": 96.0,
            },
        }
        comparisons = [
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

        self.assertTrue(
            self.repository.persist_result(
                job=self.job,
                extracted_fields=result,
                comparisons=comparisons,
                status="AUTO_VERIFIED",
                match_percentage=100.0,
            )
        )
        self.assertFalse(
            self.repository.persist_result(
                job=self.job,
                extracted_fields=result,
                comparisons=comparisons,
                status="AUTO_VERIFIED",
                match_percentage=100.0,
            )
        )

        connection = psycopg2.connect(DATABASE_URL)
        try:
            with connection.cursor() as cursor:
                cursor.execute(
                    "SELECT a.status, c.status FROM kyc_attempts a JOIN kyc_cases c ON c.id = a.kyc_case_id WHERE a.id = %s",
                    (self.attempt_id,),
                )
                self.assertEqual(cursor.fetchone(), ("AUTO_VERIFIED", "AUTO_VERIFIED"))
                cursor.execute(
                    "SELECT confidence FROM extracted_fields WHERE attempt_id = %s AND field_name = 'name'",
                    (self.attempt_id,),
                )
                self.assertEqual(cursor.fetchone(), (92.0,))
                expected_counts = {
                    "extracted_fields": 3,
                    "field_comparisons": 2,
                    "kyc_decisions": 1,
                    "audit_events": 1,
                }
                for table, expected_count in expected_counts.items():
                    cursor.execute(f"SELECT count(*) FROM {table} WHERE attempt_id = %s", (self.attempt_id,))
                    self.assertEqual(cursor.fetchone()[0], expected_count)
        finally:
            connection.close()

    def test_missing_ocr_value_persists_as_null_for_not_extracted_state(self):
        comparisons = [
            {
                "field_name": "name",
                "customer_value": "ARJUN DEMO",
                "document_value": "ARJUN DEMO",
                "is_match": True,
                "status": "MATCH",
            },
            {
                "field_name": "date_of_birth",
                "customer_value": "2000-01-02",
                "document_value": None,
                "is_match": False,
                "status": "NOT_EXTRACTED",
            },
        ]
        self.assertTrue(
            self.repository.persist_result(
                job=self.job,
                extracted_fields={
                    "name": {
                        "raw_value": "Arjun Demo",
                        "normalized_value": "ARJUN DEMO",
                        "confidence": 92.0,
                    }
                },
                comparisons=comparisons,
                status="REVIEW_REQUIRED",
                match_percentage=50.0,
            )
        )

        connection = psycopg2.connect(DATABASE_URL)
        try:
            with connection.cursor() as cursor:
                cursor.execute(
                    "SELECT document_value, is_match FROM field_comparisons WHERE attempt_id = %s AND field_name = 'date_of_birth'",
                    (self.attempt_id,),
                )
                self.assertEqual(cursor.fetchone(), (None, False))
                cursor.execute(
                    "SELECT status FROM kyc_attempts WHERE id = %s",
                    (self.attempt_id,),
                )
                self.assertEqual(cursor.fetchone(), ("REVIEW_REQUIRED",))
        finally:
            connection.close()


if __name__ == "__main__":
    unittest.main()
