"""Small PostgreSQL adapter matching Person B's initial Alembic schema."""

from __future__ import annotations

import json
import os
import time
from dataclasses import dataclass
from threading import Lock
from typing import Any

from .worker import AttemptContext, OCRJob


@dataclass
class _CachedSecret:
    value: dict[str, Any]
    expires_at: float


class PostgresRepository:
    """Persist worker output transactionally and tolerate SQS redelivery."""

    def __init__(self, *, secret_arn: str, database_name: str, secrets_client: Any):
        if not secret_arn:
            raise ValueError("DATABASE_SECRET_ARN is required")
        self.secret_arn = secret_arn
        self.database_name = database_name
        self.secrets_client = secrets_client
        self._secret: _CachedSecret | None = None
        self._secret_lock = Lock()

    def _get_secret(self) -> dict[str, Any]:
        now = time.monotonic()
        with self._secret_lock:
            if self._secret and self._secret.expires_at > now:
                return self._secret.value
            response = self.secrets_client.get_secret_value(SecretId=self.secret_arn)
            secret = json.loads(response["SecretString"])
            if not isinstance(secret, dict):
                raise ValueError("database secret must be a JSON object")
            host = secret.get("host") or os.environ.get("DATABASE_HOST")
            if not host or not secret.get("username") or not secret.get("password"):
                raise ValueError("database configuration is missing host, username, or password")
            secret["host"] = host
            self._secret = _CachedSecret(value=secret, expires_at=now + 300)
            return secret

    def _connect(self) -> Any:
        import psycopg2

        secret = self._get_secret()
        ca_bundle = os.environ.get("RDS_CA_BUNDLE", "/opt/certs/global-bundle.pem")
        if not os.path.isfile(ca_bundle):
            raise RuntimeError("RDS CA bundle is unavailable in the OCR layer")
        return psycopg2.connect(
            host=secret["host"],
            port=int(secret.get("port", 5432)),
            dbname=secret.get("dbname") or secret.get("database") or self.database_name,
            user=secret["username"],
            password=secret["password"],
            sslmode="verify-full",
            sslrootcert=ca_bundle,
            connect_timeout=5,
        )

    def get_context(self, job: OCRJob) -> AttemptContext | None:
        connection = self._connect()
        try:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT a.id::text, a.kyc_case_id::text, a.document_type, a.status,
                           c.customer_id::text,
                           cu.full_name,
                           to_char(cu.date_of_birth::date, 'YYYY-MM-DD'),
                           cu.gender,
                           concat_ws(', ', nullif(cu.address_line1, ''),
                               nullif(cu.address_line2, ''), nullif(cu.city, ''),
                               nullif(cu.state, ''), nullif(cu.pincode, '')),
                           cu.email, cu.phone_number,
                           d.s3_bucket, d.s3_key
                    FROM kyc_attempts AS a
                    JOIN kyc_cases AS c ON c.id = a.kyc_case_id
                    JOIN customers AS cu ON cu.id = c.customer_id
                    JOIN kyc_documents AS d ON d.attempt_id = a.id
                    WHERE a.id = %s
                    """,
                    (job.kyc_attempt_id,),
                )
                row = cursor.fetchone()
            if row is None:
                raise LookupError("attempt or uploaded document is not committed")
            (
                attempt_id,
                case_id,
                document_type,
                status,
                customer_id,
                full_name,
                date_of_birth,
                gender,
                address,
                email,
                phone_number,
                s3_bucket,
                s3_key,
            ) = row
            if (
                attempt_id != job.kyc_attempt_id
                or case_id != job.kyc_case_id
                or customer_id != job.customer_id
            ):
                raise ValueError("SQS identities do not match the persisted KYC records")
            if status != "PROCESSING":
                return None
            return AttemptContext(
                status=status,
                document_type=document_type,
                s3_bucket=s3_bucket,
                s3_key=s3_key,
                customer_fields={
                    "name": full_name,
                    "date_of_birth": date_of_birth,
                    "gender": gender,
                    "address": address,
                },
                customer_email=email,
                customer_phone=phone_number,
                customer_name=full_name,
            )
        finally:
            connection.close()
    def persist_result(
        self,
        *,
        job: OCRJob,
        extracted_fields: dict[str, dict[str, str | float | None]],
        comparisons: list[dict[str, object]],
        status: str,
        match_percentage: float,
    ) -> bool:
        if status not in {"AUTO_VERIFIED", "REVIEW_REQUIRED"}:
            raise ValueError("worker result status is not supported")

        connection = self._connect()
        try:
            with connection:
                with connection.cursor() as cursor:
                    cursor.execute(
                        """
                        SELECT a.status, a.kyc_case_id::text, c.customer_id::text,
                               d.s3_bucket, d.s3_key
                        FROM kyc_attempts AS a
                        JOIN kyc_cases AS c ON c.id = a.kyc_case_id
                        JOIN kyc_documents AS d ON d.attempt_id = a.id
                        WHERE a.id = %s
                        FOR UPDATE OF a, c
                        """,
                        (job.kyc_attempt_id,),
                    )
                    row = cursor.fetchone()
                    if row is None:
                        raise LookupError("attempt or uploaded document disappeared")
                    current_status, case_id, customer_id, bucket, key = row
                    if (
                        case_id != job.kyc_case_id
                        or customer_id != job.customer_id
                        or bucket != job.s3_bucket
                        or key != job.s3_key
                    ):
                        raise ValueError("SQS identities do not match the persisted KYC records")
                    if current_status != "PROCESSING":
                        return False

                    cursor.execute("DELETE FROM extracted_fields WHERE attempt_id = %s", (job.kyc_attempt_id,))
                    cursor.execute("DELETE FROM field_comparisons WHERE attempt_id = %s", (job.kyc_attempt_id,))
                    for field_name, values in extracted_fields.items():
                        cursor.execute(
                            """
                            INSERT INTO extracted_fields
                                (attempt_id, field_name, raw_value, normalized_value, confidence)
                            VALUES (%s, %s, %s, %s, %s)
                            """,
                            (
                                job.kyc_attempt_id,
                                field_name,
                                values.get("raw_value"),
                                values.get("normalized_value"),
                                values.get("confidence"),
                            ),
                        )
                    for comparison in comparisons:
                        field_name = str(comparison["field_name"])
                        cursor.execute(
                            """
                            INSERT INTO field_comparisons
                                (attempt_id, field_name, customer_value, document_value, is_match)
                            VALUES (%s, %s, %s, %s, %s)
                            """,
                            (
                                job.kyc_attempt_id,
                                field_name,
                                comparison.get("customer_value"),
                                comparison.get("document_value"),
                                bool(comparison["is_match"]),
                            ),
                        )

                    cursor.execute(
                        """
                        UPDATE kyc_attempts
                        SET status = %s, completed_at = now()
                        WHERE id = %s
                        """,
                        (status, job.kyc_attempt_id),
                    )
                    cursor.execute(
                        """
                        UPDATE kyc_cases
                        SET status = %s, updated_at = now()
                        WHERE id = %s
                        """,
                        (status, job.kyc_case_id),
                    )

                    if status == "AUTO_VERIFIED":
                        cursor.execute(
                            """
                            INSERT INTO kyc_decisions (attempt_id, decision, decided_by, notes)
                            VALUES (%s, 'AUTO_VERIFIED', 'SYSTEM', NULL)
                            ON CONFLICT (attempt_id) DO UPDATE
                            SET decision = EXCLUDED.decision,
                                decided_by = EXCLUDED.decided_by,
                                decided_at = now(),
                                notes = EXCLUDED.notes
                            """,
                            (job.kyc_attempt_id,),
                        )

                    audit_details = json.dumps(
                        {
                            "document_type": job.document_type,
                            "match_percentage": match_percentage,
                            "compared_fields": [str(item["field_name"]) for item in comparisons],
                        }
                    )
                    cursor.execute(
                        """
                        INSERT INTO audit_events (kyc_case_id, attempt_id, actor, action, details)
                        VALUES (%s, %s, 'SYSTEM', %s, %s::jsonb)
                        """,
                        (job.kyc_case_id, job.kyc_attempt_id, status, audit_details),
                    )
            return True
        finally:
            connection.close()

    def mark_processing_failure(
        self,
        *,
        job: OCRJob,
        error_type: str,
        receive_count: int,
    ) -> bool:
        """Move a repeatedly failing attempt to REVIEW_REQUIRED before DLQ routing."""
        connection = self._connect()
        try:
            with connection:
                with connection.cursor() as cursor:
                    cursor.execute(
                        """
                        SELECT a.status, a.kyc_case_id::text, c.customer_id::text,
                               d.s3_bucket, d.s3_key
                        FROM kyc_attempts AS a
                        JOIN kyc_cases AS c ON c.id = a.kyc_case_id
                        JOIN kyc_documents AS d ON d.attempt_id = a.id
                        WHERE a.id = %s
                        FOR UPDATE OF a, c
                        """,
                        (job.kyc_attempt_id,),
                    )
                    row = cursor.fetchone()
                    if row is None:
                        raise LookupError("attempt or uploaded document disappeared")
                    current_status, case_id, customer_id, bucket, key = row
                    if (
                        case_id != job.kyc_case_id
                        or customer_id != job.customer_id
                        or bucket != job.s3_bucket
                        or key != job.s3_key
                    ):
                        raise ValueError("SQS identities do not match the persisted KYC records")
                    if current_status != "PROCESSING":
                        return False

                    cursor.execute(
                        "UPDATE kyc_attempts SET status = 'REVIEW_REQUIRED', completed_at = now() WHERE id = %s",
                        (job.kyc_attempt_id,),
                    )
                    cursor.execute(
                        "UPDATE kyc_cases SET status = 'REVIEW_REQUIRED', updated_at = now() WHERE id = %s",
                        (job.kyc_case_id,),
                    )
                    details = json.dumps(
                        {
                            "failure_code": "OCR_RETRY_LIMIT",
                            "error_type": str(error_type)[:100],
                            "receive_count": receive_count,
                        }
                    )
                    cursor.execute(
                        """
                        INSERT INTO audit_events (kyc_case_id, attempt_id, actor, action, details)
                        VALUES (%s, %s, 'SYSTEM', 'REVIEW_REQUIRED', %s::jsonb)
                        """,
                        (job.kyc_case_id, job.kyc_attempt_id, details),
                    )
            return True
        finally:
            connection.close()
