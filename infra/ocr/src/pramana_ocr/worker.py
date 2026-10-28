"""SQS entry point for Lambda OCR and KYC result persistence."""

from __future__ import annotations

import json
import logging
import os
import re
from dataclasses import dataclass
from functools import lru_cache
from typing import Any, Callable, Mapping
from uuid import UUID

from .pipeline import extract_document_fields
from .verification import compare_fields

logger = logging.getLogger(__name__)
logger.setLevel(os.environ.get("LOG_LEVEL", "INFO"))

_ALLOWED_DOCUMENT_TYPES = {"AADHAAR", "PAN"}
_ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "application/pdf"}
_UUID = re.compile(r"^[0-9a-fA-F-]{36}$")


@dataclass(frozen=True)
class OCRJob:
    kyc_attempt_id: str
    kyc_case_id: str
    customer_id: str
    s3_bucket: str
    s3_key: str
    document_type: str

    @classmethod
    def from_message(cls, body: str, expected_bucket: str) -> "OCRJob":
        try:
            payload = json.loads(body)
        except (TypeError, json.JSONDecodeError) as exc:
            raise ValueError("SQS body must be valid JSON") from exc
        if not isinstance(payload, dict):
            raise ValueError("SQS body must be a JSON object")

        required = (
            "kyc_attempt_id",
            "kyc_case_id",
            "customer_id",
            "s3_bucket",
            "s3_key",
            "document_type",
        )
        if any(not isinstance(payload.get(key), str) or not payload[key] for key in required):
            raise ValueError("SQS body is missing a required contract field")

        for key in ("kyc_attempt_id", "kyc_case_id", "customer_id"):
            if not _UUID.fullmatch(payload[key]):
                raise ValueError(f"{key} must be a UUID")
            payload[key] = str(UUID(payload[key]))

        document_type = payload["document_type"].upper()
        if document_type not in _ALLOWED_DOCUMENT_TYPES:
            raise ValueError("document_type must be AADHAAR or PAN")
        if payload["s3_bucket"] != expected_bucket:
            raise ValueError("SQS bucket does not match the configured document bucket")

        key = payload["s3_key"]
        key_prefix = f"documents/{payload['customer_id']}/{payload['kyc_attempt_id']}/"
        path_parts = key.split("/")
        if (
            not key.startswith(key_prefix)
            or len(path_parts) != 4
            or any(part in {"", ".", ".."} for part in path_parts)
        ):
            raise ValueError("SQS key does not match the server-derived attempt key")

        return cls(
            kyc_attempt_id=payload["kyc_attempt_id"],
            kyc_case_id=payload["kyc_case_id"],
            customer_id=payload["customer_id"],
            s3_bucket=payload["s3_bucket"],
            s3_key=key,
            document_type=document_type,
        )


@dataclass(frozen=True)
class AttemptContext:
    status: str
    document_type: str
    s3_bucket: str
    s3_key: str
    customer_fields: Mapping[str, str | None]
    customer_email: str
    customer_phone: str
    customer_name: str


def process_job(
    job: OCRJob,
    *,
    s3_client: Any,
    repository: Any,
    notifier: Callable[[AttemptContext, str], bool],
    extractor: Callable[
        [bytes, str, str], dict[str, dict[str, str | float | None]]
    ] = extract_document_fields,
) -> str:
    """Process one attempt; final persistence serializes duplicate deliveries."""
    context: AttemptContext | None = repository.get_context(job)
    if context is None:
        return "ALREADY_COMPLETE"
    if context.status != "PROCESSING":
        return "ALREADY_COMPLETE"
    if context.document_type != job.document_type:
        raise ValueError("message document_type does not match the persisted attempt")
    if context.s3_bucket != job.s3_bucket or context.s3_key != job.s3_key:
        raise ValueError("message object does not match the persisted document")

    response = s3_client.get_object(Bucket=job.s3_bucket, Key=job.s3_key)
    body = response["Body"]
    try:
        document_bytes = body.read()
    finally:
        body.close()

    content_type = str(response.get("ContentType", "")).split(";", 1)[0].strip().lower()
    if content_type not in _ALLOWED_CONTENT_TYPES:
        raise ValueError("S3 object has an unsupported content type")
    if not document_bytes:
        raise ValueError("S3 object is empty")

    extracted = extractor(document_bytes, content_type, job.document_type)
    required_fields = {
        "AADHAAR": ("name", "date_of_birth", "gender"),
        "PAN": ("name", "date_of_birth"),
    }[job.document_type]
    normalized_fields = {
        name: values.get("normalized_value") for name, values in extracted.items()
    }
    verification = compare_fields(context.customer_fields, normalized_fields, required_fields)
    status = str(verification["overall_status"])

    transitioned = repository.persist_result(
        job=job,
        extracted_fields=extracted,
        comparisons=verification["field_comparisons"],
        status=status,
        match_percentage=float(verification["match_percentage"]),
    )
    if not transitioned:
        return "ALREADY_COMPLETE"

    if status == "AUTO_VERIFIED":
        try:
            if not notifier(context, job.kyc_case_id):
                logger.warning(
                    "Auto-verification notification was not accepted attempt_id=%s",
                    job.kyc_attempt_id,
                )
        except Exception as exc:  # Notification failure must not undo a committed result.
            logger.error(
                "Auto-verification notification failed attempt_id=%s error_type=%s",
                job.kyc_attempt_id,
                type(exc).__name__,
            )

    logger.info(
        "OCR attempt completed attempt_id=%s status=%s match_percentage=%.2f",
        job.kyc_attempt_id,
        status,
        float(verification["match_percentage"]),
    )
    return status


@lru_cache(maxsize=1)
def _aws_clients(region: str) -> tuple[Any, Any, Any]:
    import boto3

    return (
        boto3.client("s3", region_name=region),
        boto3.client("secretsmanager", region_name=region),
        boto3.client("sns", region_name=region),
    )


@lru_cache(maxsize=1)
def _ses_client(region: str) -> Any:
    import boto3

    return boto3.client("ses", region_name=region)


@lru_cache(maxsize=1)
def _repository(secret_arn: str, database_name: str, region: str) -> Any:
    from .database import PostgresRepository

    _, secrets_client, _ = _aws_clients(region)
    return PostgresRepository(
        secret_arn=secret_arn,
        database_name=database_name,
        secrets_client=secrets_client,
    )


def _send_auto_verified(context: AttemptContext, case_id: str) -> bool:
    from pramana_notifications import send_auto_verified_notification

    region = os.environ.get("AWS_REGION", "us-east-1")
    _, _, sns_client = _aws_clients(region)
    ses_client = _ses_client(region)
    sender = os.environ["SES_SENDER_EMAIL"]
    return send_auto_verified_notification(
        sns_client=sns_client,
        ses_client=ses_client,
        sender=sender,
        phone_number=context.customer_phone,
        email=context.customer_email,
        customer_name=context.customer_name,
        case_id=case_id,
    )


def handler(event: Mapping[str, Any], _context: Any) -> dict[str, list[dict[str, str]]]:
    """Lambda handler using partial batch responses so only failed records retry."""
    region = os.environ.get("AWS_REGION", "us-east-1")
    expected_bucket = os.environ["DOCUMENTS_BUCKET"]
    secret_arn = os.environ["DATABASE_SECRET_ARN"]
    database_name = os.environ.get("DATABASE_NAME", "pramana_kyc")
    s3_client, _, _ = _aws_clients(region)
    repository = _repository(secret_arn, database_name, region)

    failures: list[dict[str, str]] = []
    for record in event.get("Records", []):
        message_id = str(record.get("messageId", ""))
        try:
            job = OCRJob.from_message(record.get("body", ""), expected_bucket)
            process_job(
                job,
                s3_client=s3_client,
                repository=repository,
                notifier=_send_auto_verified,
            )
        except Exception as exc:
            logger.error(
                "OCR SQS record failed message_id=%s error_type=%s",
                message_id,
                type(exc).__name__,
            )
            failures.append({"itemIdentifier": message_id})

    return {"batchItemFailures": failures}
