"""Backend-facing adapter for the notification package shared with the worker."""

import boto3
from pramana_notifications import (
    auto_verified_email,
    rejection_sms_message,
    reviewer_decision_email,
    send_email as _send_email,
    send_sms as _send_sms,
)

from app.config import settings

sns_client = boto3.client("sns", region_name=settings.aws_region)
ses_client = boto3.client("ses", region_name=settings.aws_region)


def send_sms(phone_number: str, message: str) -> bool:
    """Send an SMS without logging the destination or message."""
    return _send_sms(sns_client, phone_number, message)


def send_email(
    to_email: str,
    subject: str,
    body_html: str,
    body_text: str,
) -> bool:
    """Send an email without logging the recipient or message contents."""
    return _send_email(
        ses_client,
        settings.ses_sender_email,
        to_email,
        subject,
        body_html,
        body_text,
    )


__all__ = [
    "auto_verified_email",
    "rejection_sms_message",
    "reviewer_decision_email",
    "send_email",
    "send_sms",
]
