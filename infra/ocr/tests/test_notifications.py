from __future__ import annotations

import unittest

from pramana_notifications import send_auto_verified_notification


class FakeSNS:
    def __init__(self):
        self.request = None

    def publish(self, **kwargs):
        self.request = kwargs
        return {"MessageId": "sms-id"}


class FakeSES:
    def __init__(self):
        self.request = None

    def send_email(self, **kwargs):
        self.request = kwargs
        return {"MessageId": "email-id"}


class NotificationTests(unittest.TestCase):
    def test_auto_verified_sms_is_generic_and_email_escapes_customer_name(self):
        sns = FakeSNS()
        ses = FakeSES()
        success = send_auto_verified_notification(
            sns_client=sns,
            ses_client=ses,
            sender="noreply@example.test",
            phone_number="+15555550123",
            email="customer@example.test",
            customer_name="<Arjun & Demo>",
            case_id="case-123",
        )
        self.assertTrue(success)
        self.assertNotIn("Arjun", sns.request["Message"])
        self.assertNotIn("case-123", sns.request["Message"])
        self.assertIn("&lt;Arjun &amp; Demo&gt;", ses.request["Message"]["Body"]["Html"]["Data"])
        self.assertEqual(ses.request["Source"], "noreply@example.test")


if __name__ == "__main__":
    unittest.main()
