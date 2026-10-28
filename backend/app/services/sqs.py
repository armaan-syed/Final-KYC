"""SQS integration for OCR worker job enqueueing.

Exactly one SQS message is enqueued per accepted KYC attempt. The message
payload matches the contract defined in context/person-b.md section 6.2.
"""

import json
import logging

import boto3
from botocore.exceptions import ClientError

from app.config import settings
from app.schemas.verification import OCRWorkerMessage

logger = logging.getLogger(__name__)

sqs_client = boto3.client("sqs", region_name=settings.aws_region)


def enqueue_ocr_job(
    *,
    kyc_attempt_id,
    kyc_case_id,
    customer_id,
    s3_bucket: str,
    s3_key: str,
    document_type: str,
) -> str:
    """Enqueue an OCR worker job for a submitted KYC attempt.

    Returns the SQS message ID. Raises on failure so the caller can roll back
    the database transaction if needed.
    """
    message_body = OCRWorkerMessage(
        kyc_attempt_id=kyc_attempt_id,
        kyc_case_id=kyc_case_id,
        customer_id=customer_id,
        s3_bucket=s3_bucket,
        s3_key=s3_key,
        document_type=document_type,
    )

    try:
        response = sqs_client.send_message(
            QueueUrl=settings.sqs_queue_url,
            MessageBody=message_body.model_dump_json(),
            MessageGroupId=f"kyc-{kyc_case_id}",
            MessageDeduplicationId=str(kyc_attempt_id),
        )
    except ClientError as exc:
        logger.error("SQS send_message failed: %s", exc, exc_info=True)
        raise

    message_id = response.get("MessageId", "")
    logger.info(
        "Enqueued OCR job attempt_id=%s case_id=%s message_id=%s",
        kyc_attempt_id,
        kyc_case_id,
        message_id,
    )
    return message_id