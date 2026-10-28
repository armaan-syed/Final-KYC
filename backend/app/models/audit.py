"""AuditEvent ORM model."""

from datetime import datetime
from typing import Any, Optional
from uuid import UUID, uuid4

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class AuditEvent(Base):
    __tablename__ = "audit_events"

    id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid4
    )
    kyc_case_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("kyc_cases.id", ondelete="CASCADE"), nullable=False, index=True
    )
    attempt_id: Mapped[Optional[UUID]] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("kyc_attempts.id", ondelete="CASCADE"), nullable=True, index=True
    )
    actor: Mapped[str] = mapped_column(String(255), nullable=False)
    # 'SYSTEM' or reviewer cognito_sub
    action: Mapped[str] = mapped_column(String(100), nullable=False)
    # SUBMITTED, PROCESSING_STARTED, AUTO_VERIFIED, REVIEW_REQUIRED,
    # REVIEWER_APPROVED, REVIEWER_REJECTED, REUPLOAD_REQUESTED,
    # NOTIFICATION_ATTEMPTED
    details: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), index=True
    )

    # Relationships
    kyc_case: Mapped["KYCCase"] = relationship("KYCCase")
    attempt: Mapped[Optional["KYCAttempt"]] = relationship("KYCAttempt")

    def __repr__(self) -> str:  # pragma: no cover - debugging only
        return f"<AuditEvent id={self.id} case_id={self.kyc_case_id} action={self.action} actor={self.actor}>"
