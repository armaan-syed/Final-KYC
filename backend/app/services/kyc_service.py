"""KYC business logic service.

Coordinates case/attempt creation, document upload, SQS enqueueing,
reviewer decisions, and audit event writing.
"""

from datetime import datetime, timezone
import logging
from typing import Optional
from uuid import UUID

from sqlalchemy.orm import Session

from app.config import settings
from app.models.audit import AuditEvent
from app.models.customer import Customer
from app.models.kyc import KYCAttempt, KYCCase, KYCDocument, KYCDecision
from app.models.reviewer import Reviewer
from app.schemas.kyc import SubmitKYCResponse, UploadURLResponse
from app.services.notification import (
    auto_verified_email,
    reviewer_decision_email,
    rejection_sms_message,
    send_email,
    send_sms,
)
from app.services.s3 import derive_s3_key, generate_presigned_upload_url
from app.services.sqs import enqueue_ocr_job

logger = logging.getLogger(__name__)


class KYCService:
    def __init__(self, db: Session):
        self.db = db

    # ------------------------------------------------------------------
    # Case lifecycle
    # ------------------------------------------------------------------
    def get_or_create_case(self, customer: Customer) -> KYCCase:
        """Return the customer's existing KYC case or create a new PENDING one."""
        case = self.db.query(KYCCase).filter_by(customer_id=customer.id).first()
        if case is None:
            case = KYCCase(customer_id=customer.id, status="PENDING")
            self.db.add(case)
            self.db.flush()
        return case

    def _next_attempt_number(self, case: KYCCase) -> int:
        if not case.attempts:
            return 1
        return max(a.attempt_number for a in case.attempts) + 1

    # ------------------------------------------------------------------
    # Upload URL
    # ------------------------------------------------------------------
    def create_upload_url(
        self,
        customer: Customer,
        case: KYCCase,
        document_type: str,
        file_name: str,
        content_type: str,
    ) -> UploadURLResponse:
        """Generate a presigned upload URL and create a PROCESSING attempt.

        The attempt row is created here so the S3 key can include attempt_id.
        If the customer never uploads, the attempt remains as an abandoned
        PROCESSING attempt.
        """
        attempt_number = self._next_attempt_number(case)
        attempt = KYCAttempt(
            kyc_case_id=case.id,
            attempt_number=attempt_number,
            document_type=document_type,
            status="PROCESSING",
        )
        self.db.add(attempt)
        self.db.flush()

        case.status = "PROCESSING"
        case.updated_at = datetime.now(timezone.utc)

        s3_key = derive_s3_key(str(customer.id), str(attempt.id), file_name)
        upload_url = generate_presigned_upload_url(s3_key, content_type)

        self._write_audit_event(
            kyc_case_id=case.id,
            attempt_id=attempt.id,
            actor=str(customer.cognito_sub),
            action="SUBMITTED",
            details={
                "document_type": document_type,
                "file_name": file_name,
                "content_type": content_type,
                "s3_key": s3_key,
            },
        )

        self.db.commit()

        return UploadURLResponse(
            upload_url=upload_url,
            s3_key=s3_key,
            expires_in=settings.presigned_url_expiry_seconds,
        )

    # ------------------------------------------------------------------
    # Submit
    # ------------------------------------------------------------------
    def submit_kyc(
        self,
        customer: Customer,
        case: KYCCase,
        attempt_id: UUID,
        document_type: str,
        file_name: str,
        file_size_bytes: Optional[int] = None,
    ) -> SubmitKYCResponse:
        """Mark an attempt as submitted, create the document row, and enqueue SQS.

        The attempt must belong to the customer's case and be in PROCESSING or
        REUPLOAD_REQUESTED state. After DB commit, exactly one SQS message is
        enqueued for the OCR worker.
        """
        attempt = (
            self.db.query(KYCAttempt)
            .filter_by(id=attempt_id, kyc_case_id=case.id)
            .first()
        )
        if attempt is None:
            raise ValueError("Attempt not found for this case")
        if attempt.status not in ("PROCESSING", "REUPLOAD_REQUESTED"):
            raise ValueError(f"Attempt cannot be submitted in status: {attempt.status}")

        if attempt.document_type != document_type:
            raise ValueError("Document type does not match the attempt")

        # Create/update document row
        existing_doc = self.db.query(KYCDocument).filter_by(attempt_id=attempt.id).first()
        s3_key = derive_s3_key(str(customer.id), str(attempt.id), file_name)

        if existing_doc is None:
            document = KYCDocument(
                attempt_id=attempt.id,
                s3_bucket=settings.s3_documents_bucket,
                s3_key=s3_key,
                file_name=file_name,
                file_size_bytes=file_size_bytes,
            )
            self.db.add(document)
        else:
            existing_doc.s3_key = s3_key
            existing_doc.file_name = file_name
            existing_doc.file_size_bytes = file_size_bytes

        attempt.status = "PROCESSING"
        attempt.completed_at = None
        case.status = "PROCESSING"
        case.updated_at = datetime.now(timezone.utc)

        self.db.flush()

        # Enqueue SQS message for the OCR worker
        enqueue_ocr_job(
            kyc_attempt_id=attempt.id,
            kyc_case_id=case.id,
            customer_id=customer.id,
            s3_bucket=settings.s3_documents_bucket,
            s3_key=s3_key,
            document_type=document_type,
        )

        self._write_audit_event(
            kyc_case_id=case.id,
            attempt_id=attempt.id,
            actor=str(customer.cognito_sub),
            action="PROCESSING_STARTED",
            details={
                "document_type": document_type,
                "file_name": file_name,
                "s3_key": s3_key,
            },
        )

        self.db.commit()

        return SubmitKYCResponse(
            attempt_id=attempt.id,
            attempt_number=attempt.attempt_number,
            status=attempt.status,
            message="Document submitted. You will be notified once verification is complete.",
        )

    # ------------------------------------------------------------------
    # Reviewer decision
    # ------------------------------------------------------------------
    def record_decision(
        self,
        case: KYCCase,
        attempt: KYCAttempt,
        reviewer: Reviewer,
        decision: str,
        notes: Optional[str] = None,
    ) -> dict:
        """Record a reviewer decision, update case/attempt status, and write audit.

        decision: APPROVED | REJECTED | REUPLOAD_REQUESTED
        """
        # Validate allowed transitions
        current = attempt.status
        allowed_transitions = {
            "REVIEW_REQUIRED": {"APPROVED", "REJECTED", "REUPLOAD_REQUESTED"},
        }
        if current not in allowed_transitions or decision not in allowed_transitions[current]:
            raise ValueError(
                f"Cannot decision '{decision}' on attempt in status '{current}'"
            )

        # Save or update decision row
        existing_decision = (
            self.db.query(KYCDecision).filter_by(attempt_id=attempt.id).first()
        )
        if existing_decision is None:
            decision_row = KYCDecision(
                attempt_id=attempt.id,
                decision=decision,
                decided_by=str(reviewer.cognito_sub),
                notes=notes,
            )
            self.db.add(decision_row)
        else:
            existing_decision.decision = decision
            existing_decision.decided_by = str(reviewer.cognito_sub)
            existing_decision.notes = notes

        # Update attempt and case status
        status_map = {
            "APPROVED": "APPROVED",
            "REJECTED": "REJECTED",
            "REUPLOAD_REQUESTED": "REUPLOAD_REQUESTED",
        }
        attempt.status = status_map[decision]
        attempt.completed_at = datetime.now(timezone.utc)
        case.status = status_map[decision]
        case.updated_at = datetime.now(timezone.utc)

        # Write audit event
        self._write_audit_event(
            kyc_case_id=case.id,
            attempt_id=attempt.id,
            actor=str(reviewer.cognito_sub),
            action=f"REVIEWER_{decision}",
            details={
                "decision": decision,
                "notes": notes,
                "previous_status": current,
            },
        )

        self.db.flush()

        # Persist the decision before calling external providers. A provider
        # failure must not roll back a completed reviewer action.
        self.db.commit()

        # Notifications to customer. The audit records the provider request's
        # accepted/failed result (not a claim of final delivery).
        customer = self.db.query(Customer).filter_by(id=case.customer_id).first()
        if customer:
            if decision == "REJECTED":
                sms_accepted = send_sms(customer.phone_number, rejection_sms_message())
                self._record_notification_attempt(
                    case, attempt, "SNS_SMS", sms_accepted
                )
                subject, body_text, body_html = reviewer_decision_email(
                    customer.email, customer.full_name, str(case.id), "rejected"
                )
                email_accepted = send_email(customer.email, subject, body_html, body_text)
                self._record_notification_attempt(
                    case, attempt, "SES_EMAIL", email_accepted
                )
            elif decision == "APPROVED":
                subject, body_text, body_html = reviewer_decision_email(
                    customer.email, customer.full_name, str(case.id), "approved"
                )
                email_accepted = send_email(customer.email, subject, body_html, body_text)
                self._record_notification_attempt(
                    case, attempt, "SES_EMAIL", email_accepted
                )
            elif decision == "REUPLOAD_REQUESTED":
                subject, body_text, body_html = reviewer_decision_email(
                    customer.email, customer.full_name, str(case.id), "re-upload requested"
                )
                email_accepted = send_email(customer.email, subject, body_html, body_text)
                self._record_notification_attempt(
                    case, attempt, "SES_EMAIL", email_accepted
                )

        return {
            "message": "Decision recorded.",
            "decision": decision,
            "decided_at": attempt.completed_at,
        }

    def _record_notification_attempt(
        self,
        case: KYCCase,
        attempt: KYCAttempt,
        channel: str,
        accepted: bool,
    ) -> None:
        """Append a safe audit record for an attempted provider send.

        Provider acceptance is not proof of delivery. If recording the audit
        event fails, preserve the already-committed decision and log no PII.
        """
        try:
            self._write_audit_event(
                kyc_case_id=case.id,
                attempt_id=attempt.id,
                actor="SYSTEM",
                action="NOTIFICATION_ATTEMPTED",
                details={
                    "channel": channel,
                    "provider_accepted": accepted,
                },
            )
            self.db.commit()
        except Exception as exc:  # notification audit must not undo the decision
            self.db.rollback()
            logger.warning(
                "Could not persist notification audit (channel=%s, error_type=%s)",
                channel,
                type(exc).__name__,
            )

    # ------------------------------------------------------------------
    # Audit
    # ------------------------------------------------------------------
    def _write_audit_event(
        self,
        kyc_case_id: UUID,
        attempt_id: Optional[UUID],
        actor: str,
        action: str,
        details: Optional[dict] = None,
    ) -> None:
        """Append an audit event (append-only — no update/delete path)."""
        event = AuditEvent(
            kyc_case_id=kyc_case_id,
            attempt_id=attempt_id,
            actor=actor,
            action=action,
            details=details or {},
        )
        self.db.add(event)
        self.db.flush()
