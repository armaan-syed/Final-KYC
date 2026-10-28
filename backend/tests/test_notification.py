from unittest.mock import MagicMock

from botocore.exceptions import ClientError

from app.services import notification


def test_rejection_sms_is_generic():
    message = notification.rejection_sms_message()
    assert "KYC verification could not be completed" in message
    assert "mismatch" not in message.lower()
    assert "document" not in message.lower()


def test_reviewer_email_html_escapes_customer_fields():
    _, body_text, body_html = notification.reviewer_decision_email(
        "customer@example.test", "<script>alert(1)</script>", "<case>", "approved"
    )
    assert "<script>" not in body_html
    assert "&lt;script&gt;" in body_html
    assert "&lt;case&gt;" in body_html
    assert "<script>" in body_text


def test_sns_provider_error_returns_false_without_logging_destination(monkeypatch, caplog):
    phone_number = "+15551234567"
    error = ClientError(
        {"Error": {"Code": "AccessDenied", "Message": f"failed for {phone_number}"}},
        "Publish",
    )
    monkeypatch.setattr(notification.sns_client, "publish", lambda **_: (_ for _ in ()).throw(error))

    result = notification.send_sms(phone_number, "generic message")

    assert result is False
    assert phone_number not in caplog.text
    assert "AccessDenied" in caplog.text


def test_ses_send_email_uses_configured_sender(monkeypatch):
    send_email = MagicMock()
    monkeypatch.setattr(notification.ses_client, "send_email", send_email)

    assert notification.send_email("a@example.test", "subject", "<p>body</p>", "body") is True
    assert send_email.call_args.kwargs["Destination"] == {"ToAddresses": ["a@example.test"]}
