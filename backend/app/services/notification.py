"""Notification service interface for SNS (SMS) and SES (email).

Person A's OCR worker imports and calls this module. The backend API also
uses it for notifications it owns (e.g., document submission confirmation).

All templates preserve the contract: generic rejection SMS (no sensitive
detail), portal-only rejection detail, and no sensitive values in SMS.
"""

import html
import logging

import boto3
from botocore.exceptions import BotoCoreError, ClientError

from app.config import settings

logger = logging.getLogger(__name__)

sns_client = boto3.client("sns", region_name=settings.aws_region)
ses_client = boto3.client("ses", region_name=settings.aws_region)


def send_sms(phone_number: str, message: str) -> bool:
    """Send an SMS via SNS.

    Returns True if the send request was accepted, False otherwise.
    Failures are logged and do not raise, so a notification error never
    blocks a verified KYC decision.
    """
    try:
        sns_client.publish(
            PhoneNumber=phone_number,
            Message=message,
        )
        return True
    except (BotoCoreError, ClientError) as exc:
        # Do not log provider request/response objects: they may contain a
        # destination phone number or message metadata.
        error_response = getattr(exc, "response", {})
        code = error_response.get("Error", {}).get("Code", type(exc).__name__)
        logger.warning("SNS SMS send failed (code=%s)", code)
        return False


def send_email(
    to_email: str,
    subject: str,
    body_html: str,
    body_text: str,
) -> bool:
    """Send an email via SES.

    Returns True if the send request was accepted, False otherwise.
    """
    try:
        ses_client.send_email(
            Source=settings.ses_sender_email,
            Destination={"ToAddresses": [to_email]},
            Message={
                "Subject": {"Data": subject},
                "Body": {
                    "Text": {"Data": body_text},
                    "Html": {"Data": body_html},
                },
            },
        )
        return True
    except (BotoCoreError, ClientError) as exc:
        error_response = getattr(exc, "response", {})
        code = error_response.get("Error", {}).get("Code", type(exc).__name__)
        logger.warning("SES email send failed (code=%s)", code)
        return False


# ---------------------------------------------------------------------------
# Template helpers
# ---------------------------------------------------------------------------

REJECTION_SMS_TEMPLATE = (
    "Your KYC verification could not be completed. "
    "Please log in to the Pramana portal for more information."
)


def rejection_sms_message() -> str:
    """Generic rejection SMS — never includes sensitive or mismatch details."""
    return REJECTION_SMS_TEMPLATE


def auto_verified_email(
    to_email: str,
    customer_name: str,
    kyc_case_id: str,
) -> tuple[str, str, str]:
    """Build auto-verification email subject and body."""
    subject = "Your KYC verification is complete"
    body_text = (
        f"Hello {customer_name},\n\n"
        f"Your KYC verification (case {kyc_case_id}) has been automatically verified. "
        "All document fields matched your registered information.\n\n"
        "Thank you,\nPramana Team"
    )
    safe_name = html.escape(customer_name)
    safe_case_id = html.escape(kyc_case_id)
    body_html = (
        f"<p>Hello {safe_name},</p>"
        f"<p>Your KYC verification (case <strong>{safe_case_id}</strong>) has been "
        "automatically verified. All document fields matched your registered information.</p>"
        "<p>Thank you,<br/>Pramana Team</p>"
    )
    return subject, body_text, body_html


def reviewer_decision_email(
    to_email: str,
    customer_name: str,
    kyc_case_id: str,
    decision: str,
) -> tuple[str, str, str]:
    """Build reviewer decision email."""
    subject = f"KYC verification {decision.lower()} — case {kyc_case_id}"
    body_text = (
        f"Hello {customer_name},\n\n"
        f"Your KYC verification (case {kyc_case_id}) has been {decision.lower()} "
        f"by a reviewer.\n\n"
        "Please log in to the Pramana portal for more information.\n\n"
        "Thank you,\nPramana Team"
    )
    safe_name = html.escape(customer_name)
    safe_case_id = html.escape(kyc_case_id)
    safe_decision = html.escape(decision.lower())
    body_html = (
        f"<p>Hello {safe_name},</p>"
        f"<p>Your KYC verification (case <strong>{safe_case_id}</strong>) has been "
        f"<strong>{safe_decision}</strong> by a reviewer.</p>"
        "<p>Please log in to the Pramana portal for more information.</p>"
        "<p>Thank you,<br/>Pramana Team</p>"
    )
    return subject, body_text, body_html
