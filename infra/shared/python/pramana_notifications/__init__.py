"""Notification templates and AWS client adapters shared by the API and OCR worker."""

from __future__ import annotations

import logging
from html import escape
from typing import Any

from botocore.exceptions import BotoCoreError, ClientError

logger = logging.getLogger(__name__)

REJECTION_SMS_TEMPLATE = (
    "Your KYC verification could not be completed. "
    "Please log in to the Pramana portal for more information."
)
AUTO_VERIFIED_SMS_TEMPLATE = (
    "Your KYC verification for Pramāṇa has been successfully completed. Welcome!"
)


def rejection_sms_message() -> str:
    return REJECTION_SMS_TEMPLATE


def auto_verified_email(
    to_email: str,
    customer_name: str,
    kyc_case_id: str,
) -> tuple[str, str, str]:
    subject = "Your KYC verification is complete"
    body_text = (
        f"Hello {customer_name},\n\n"
        f"Your KYC verification (case {kyc_case_id}) has been automatically verified. "
        "All required document fields matched your registered information.\n\n"
        "Thank you,\nPramana Team"
    )
    body_html = (
        f"<p>Hello {escape(customer_name)},</p>"
        f"<p>Your KYC verification (case <strong>{escape(kyc_case_id)}</strong>) has been "
        "automatically verified. All required document fields matched your registered information.</p>"
        "<p>Thank you,<br/>Pramana Team</p>"
    )
    return subject, body_text, body_html


def reviewer_decision_email(
    to_email: str,
    customer_name: str,
    kyc_case_id: str,
    decision: str,
) -> tuple[str, str, str]:
    safe_decision = decision.lower()
    subject = f"KYC verification {safe_decision} — case {kyc_case_id}"
    body_text = (
        f"Hello {customer_name},\n\n"
        f"Your KYC verification (case {kyc_case_id}) has been {safe_decision} "
        "by a reviewer.\n\n"
        "Please log in to the Pramana portal for more information.\n\n"
        "Thank you,\nPramana Team"
    )
    body_html = (
        f"<p>Hello {escape(customer_name)},</p>"
        f"<p>Your KYC verification (case <strong>{escape(kyc_case_id)}</strong>) has been "
        f"<strong>{escape(safe_decision)}</strong> by a reviewer.</p>"
        "<p>Please log in to the Pramana portal for more information.</p>"
        "<p>Thank you,<br/>Pramana Team</p>"
    )
    return subject, body_text, body_html


def send_sms(sns_client: Any, phone_number: str, message: str) -> bool:
    try:
        sns_client.publish(PhoneNumber=phone_number, Message=message)
        return True
    except (BotoCoreError, ClientError) as exc:
        error_response = getattr(exc, "response", {})
        code = error_response.get("Error", {}).get("Code", type(exc).__name__)
        logger.warning("SNS SMS send failed (code=%s)", code)
        return False
    except Exception as exc:
        logger.warning("SNS SMS send failed (error_type=%s)", type(exc).__name__)
        return False


def send_email(
    ses_client: Any,
    sender: str,
    to_email: str,
    subject: str,
    body_html: str,
    body_text: str,
) -> bool:
    try:
        ses_client.send_email(
            Source=sender,
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
    except Exception as exc:
        logger.warning("SES email send failed (error_type=%s)", type(exc).__name__)
        return False


def send_auto_verified_notification(
    *,
    sns_client: Any,
    ses_client: Any,
    sender: str,
    phone_number: str,
    email: str,
    customer_name: str,
    case_id: str,
) -> bool:
    sms_sent = send_sms(sns_client, phone_number, AUTO_VERIFIED_SMS_TEMPLATE)
    subject, body_text, body_html = auto_verified_email(email, customer_name, case_id)
    email_sent = send_email(ses_client, sender, email, subject, body_html, body_text)
    return sms_sent and email_sent
