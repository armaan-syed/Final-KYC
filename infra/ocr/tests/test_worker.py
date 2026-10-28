from __future__ import annotations

import io
import json
import unittest
from unittest.mock import patch
from uuid import UUID

from pramana_ocr.worker import AttemptContext, OCRJob, handler, process_job


ATTEMPT_ID = "11111111-1111-4111-8111-111111111111"
CASE_ID = "22222222-2222-4222-8222-222222222222"
CUSTOMER_ID = "33333333-3333-4333-8333-333333333333"
BUCKET = "pramana-documents-test"
KEY = f"documents/{CUSTOMER_ID}/{ATTEMPT_ID}/document.pdf"


def message(**overrides):
    values = {
        "kyc_attempt_id": ATTEMPT_ID,
        "kyc_case_id": CASE_ID,
        "customer_id": CUSTOMER_ID,
        "s3_bucket": BUCKET,
        "s3_key": KEY,
        "document_type": "PAN",
    }
    values.update(overrides)
    return json.dumps(values)


class FakeBody(io.BytesIO):
    was_closed = False

    def close(self):
        self.was_closed = True
        super().close()


class FakeS3:
    def __init__(self, content_type="application/pdf", content_length=None, body=None):
        self.content_type = content_type
        self.body = FakeBody(body if body is not None else b"synthetic document")
        self.content_length = content_length
        self.calls = []

    def get_object(self, **kwargs):
        self.calls.append(kwargs)
        response = {"Body": self.body, "ContentType": self.content_type}
        if self.content_length is not None:
            response["ContentLength"] = self.content_length
        return response


class FakeRepository:
    def __init__(self, context=None, transitioned=True):
        self.context = context or AttemptContext(
            status="PROCESSING",
            document_type="PAN",
            s3_bucket=BUCKET,
            s3_key=KEY,
            customer_fields={"name": "ARJUN DEMO", "date_of_birth": "2000-01-02"},
            customer_email="customer@example.test",
            customer_phone="+15555550123",
            customer_name="Arjun Demo",
        )
        self.transitioned = transitioned
        self.persisted = []

    def get_context(self, job):
        return self.context

    def persist_result(self, **kwargs):
        self.persisted.append(kwargs)
        return self.transitioned


def exact_pan(*_args):
    return {
        "name": {"raw_value": "Arjun Demo", "normalized_value": "ARJUN DEMO"},
        "date_of_birth": {"raw_value": "02/01/2000", "normalized_value": "2000-01-02"},
        "pan_number": {"raw_value": "ABCDE1234F", "normalized_value": "ABCDE1234F"},
    }


class OCRJobContractTests(unittest.TestCase):
    def test_accepts_six_field_backend_contract(self):
        job = OCRJob.from_message(message(), BUCKET)
        self.assertEqual(job.kyc_attempt_id, str(UUID(ATTEMPT_ID)))
        self.assertEqual(job.document_type, "PAN")

    def test_rejects_wrong_bucket_or_path(self):
        with self.assertRaisesRegex(ValueError, "configured document bucket"):
            OCRJob.from_message(message(s3_bucket="other-bucket"), BUCKET)
        with self.assertRaisesRegex(ValueError, "server-derived"):
            OCRJob.from_message(message(s3_key=f"documents/{CUSTOMER_ID}/../bad.pdf"), BUCKET)

    def test_rejects_invalid_document_type(self):
        with self.assertRaisesRegex(ValueError, "AADHAAR or PAN"):
            OCRJob.from_message(message(document_type="PASSPORT"), BUCKET)


class WorkerProcessingTests(unittest.TestCase):
    def setUp(self):
        self.job = OCRJob.from_message(message(), BUCKET)
        self.s3 = FakeS3()
        self.repository = FakeRepository()
        self.notifications = []

    def notify(self, context, case_id):
        self.notifications.append((context, case_id))
        return True

    def test_auto_verification_persists_and_notifies_after_upload_read(self):
        result = process_job(
            self.job,
            s3_client=self.s3,
            repository=self.repository,
            notifier=self.notify,
            extractor=exact_pan,
        )
        self.assertEqual(result, "AUTO_VERIFIED")
        self.assertTrue(self.s3.body.was_closed)
        self.assertEqual(self.repository.persisted[0]["status"], "AUTO_VERIFIED")
        self.assertEqual(self.repository.persisted[0]["match_percentage"], 100.0)
        comparison = self.repository.persisted[0]["comparisons"][0]
        self.assertEqual(comparison["customer_value"], "ARJUN DEMO")
        self.assertEqual(comparison["document_value"], "ARJUN DEMO")
        self.assertEqual(len(self.notifications), 1)

    def test_mismatch_is_review_required_without_notification(self):
        def mismatch(*_args):
            result = exact_pan()
            result["name"]["normalized_value"] = "OTHER PERSON"
            return result

        result = process_job(
            self.job,
            s3_client=self.s3,
            repository=self.repository,
            notifier=self.notify,
            extractor=mismatch,
        )
        self.assertEqual(result, "REVIEW_REQUIRED")
        self.assertEqual(self.repository.persisted[0]["status"], "REVIEW_REQUIRED")
        self.assertEqual(self.repository.persisted[0]["match_percentage"], 50.0)
        self.assertEqual(self.notifications, [])

    def test_duplicate_or_completed_attempt_does_not_notify(self):
        self.repository.transitioned = False
        result = process_job(
            self.job,
            s3_client=self.s3,
            repository=self.repository,
            notifier=self.notify,
            extractor=exact_pan,
        )
        self.assertEqual(result, "ALREADY_COMPLETE")
        self.assertEqual(self.notifications, [])

    def test_notification_failure_does_not_roll_back_verified_result(self):
        def fail_notification(_context, _case_id):
            return False

        result = process_job(
            self.job,
            s3_client=self.s3,
            repository=self.repository,
            notifier=fail_notification,
            extractor=exact_pan,
        )
        self.assertEqual(result, "AUTO_VERIFIED")
        self.assertEqual(self.repository.persisted[0]["status"], "AUTO_VERIFIED")

    def test_unsupported_s3_content_type_fails(self):
        self.s3 = FakeS3("text/plain")
        with self.assertRaisesRegex(ValueError, "unsupported content type"):
            process_job(
                self.job,
                s3_client=self.s3,
                repository=self.repository,
                notifier=self.notify,
                extractor=exact_pan,
            )
        self.assertEqual(self.repository.persisted, [])

    def test_document_over_10_mib_is_rejected_and_body_closed(self):
        from pramana_limits import MAX_DOCUMENT_BYTES

        self.s3 = FakeS3(content_length=MAX_DOCUMENT_BYTES + 1)
        with self.assertRaisesRegex(ValueError, "10 MiB"):
            process_job(
                self.job,
                s3_client=self.s3,
                repository=self.repository,
                notifier=self.notify,
                extractor=exact_pan,
            )
        self.assertTrue(self.s3.body.was_closed)
        self.assertEqual(self.repository.persisted, [])

    def test_attempt_document_type_must_match_message(self):
        self.repository.context = AttemptContext(
            **{**self.repository.context.__dict__, "document_type": "AADHAAR"}
        )
        with self.assertRaisesRegex(ValueError, "persisted attempt"):
            process_job(
                self.job,
                s3_client=self.s3,
                repository=self.repository,
                notifier=self.notify,
                extractor=exact_pan,
            )


class LambdaHandlerTests(unittest.TestCase):
    def test_reports_only_failed_records(self):
        record = {"messageId": "message-1", "body": message()}
        invalid = {"messageId": "message-2", "body": "not-json"}
        context = FakeRepository()
        with patch.dict(
            "os.environ",
            {"DOCUMENTS_BUCKET": BUCKET, "DATABASE_SECRET_ARN": "secret", "AWS_REGION": "us-east-1"},
        ), patch("pramana_ocr.worker._aws_clients", return_value=(FakeS3(), object(), object())), patch(
            "pramana_ocr.worker._repository", return_value=context
        ), patch("pramana_ocr.worker.process_job", side_effect=["AUTO_VERIFIED", RuntimeError("hidden")]):
            result = handler({"Records": [record, invalid]}, None)
        self.assertEqual(result, {"batchItemFailures": [{"itemIdentifier": "message-2"}]})

    def test_final_retry_marks_attempt_review_required_and_keeps_record_for_dlq(self):
        record = {
            "messageId": "message-1",
            "body": message(),
            "attributes": {"ApproximateReceiveCount": "3"},
        }
        repository = FakeRepository()
        repository.mark_processing_failure = unittest.mock.Mock(return_value=True)
        with patch.dict(
            "os.environ",
            {"DOCUMENTS_BUCKET": BUCKET, "DATABASE_SECRET_ARN": "secret", "AWS_REGION": "us-east-1"},
        ), patch("pramana_ocr.worker._aws_clients", return_value=(FakeS3(), object(), object())), patch(
            "pramana_ocr.worker._repository", return_value=repository
        ), patch("pramana_ocr.worker.process_job", side_effect=RuntimeError("details must not persist")):
            result = handler({"Records": [record]}, None)
        self.assertEqual(result, {"batchItemFailures": [{"itemIdentifier": "message-1"}]})
        repository.mark_processing_failure.assert_called_once()
        kwargs = repository.mark_processing_failure.call_args.kwargs
        self.assertEqual(kwargs["error_type"], "RuntimeError")
        self.assertEqual(kwargs["receive_count"], 3)

    def test_earlier_retry_does_not_mark_attempt_failed(self):
        record = {
            "messageId": "message-1",
            "body": message(),
            "attributes": {"ApproximateReceiveCount": "2"},
        }
        repository = FakeRepository()
        repository.mark_processing_failure = unittest.mock.Mock()
        with patch.dict(
            "os.environ",
            {"DOCUMENTS_BUCKET": BUCKET, "DATABASE_SECRET_ARN": "secret", "AWS_REGION": "us-east-1"},
        ), patch("pramana_ocr.worker._aws_clients", return_value=(FakeS3(), object(), object())), patch(
            "pramana_ocr.worker._repository", return_value=repository
        ), patch("pramana_ocr.worker.process_job", side_effect=RuntimeError("temporary")):
            result = handler({"Records": [record]}, None)
        self.assertEqual(result, {"batchItemFailures": [{"itemIdentifier": "message-1"}]})
        repository.mark_processing_failure.assert_not_called()


if __name__ == "__main__":
    unittest.main()
