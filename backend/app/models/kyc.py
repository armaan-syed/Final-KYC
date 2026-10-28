"""KYC Case, Attempt, and Document ORM models."""

from datetime import datetime
from typing import Optional
from uuid import UUID, uuid4

from sqlalchemy import DateTime, ForeignKey, String, Text, func, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class KYCCase(Base):
    __tablename__ = "kyc_cases"

    id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid4
    )
    customer_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("customers.id", ondelete="CASCADE"), nullable=False, index=True
    )
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="PENDING", index=True)
    # PENDING, PROCESSING, AUTO_VERIFIED, APPROVED, REJECTED, REUPLOAD_PENDING
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    __table_args__ = (
        UniqueConstraint("customer_id", name="uq_customer_kyc_case"),
    )

    # Relationships
    customer: Mapped["Customer"] = relationship("Customer", back_populates="kyc_case")
    attempts: Mapped[list["KYCAttempt"]] = relationship(
        "KYCAttempt", back_populates="kyc_case", cascade="all, delete-orphan", order_by="KYCAttempt.attempt_number"
    )

    def __repr__(self) -> str:  # pragma: no cover - debugging only
        return f"<KYCCase id={self.id} customer_id={self.customer_id} status={self.status}>"


class KYCAttempt(Base):
    __tablename__ = "kyc_attempts"

    id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid4
    )
    kyc_case_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("kyc_cases.id", ondelete="CASCADE"), nullable=False, index=True
    )
    attempt_number: Mapped[int] = mapped_column(nullable=False)
    document_type: Mapped[str] = mapped_column(String(20), nullable=False)
    # AADHAAR, PAN
    status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="PROCESSING", index=True
    )
    # PROCESSING, AUTO_VERIFIED, REVIEW_REQUIRED, APPROVED, REJECTED, REUPLOAD_REQUESTED
    submitted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        UniqueConstraint("kyc_case_id", "attempt_number", name="uq_attempt_number"),
    )

    # Relationships
    kyc_case: Mapped["KYCCase"] = relationship("KYCCase", back_populates="attempts")
    document: Mapped[Optional["KYCDocument"]] = relationship(
        "KYCDocument", back_populates="attempt", uselist=False, cascade="all, delete-orphan"
    )
    extracted_fields: Mapped[list["ExtractedField"]] = relationship(
        "ExtractedField", back_populates="attempt", cascade="all, delete-orphan"
    )
    field_comparisons: Mapped[list["FieldComparison"]] = relationship(
        "FieldComparison", back_populates="attempt", cascade="all, delete-orphan"
    )
    decision: Mapped[Optional["KYCDecision"]] = relationship(
        "KYCDecision", back_populates="attempt", uselist=False, cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:  # pragma: no cover - debugging only
        return f"<KYCAttempt id={self.id} case_id={self.kyc_case_id} number={self.attempt_number} status={self.status}>"


class KYCDocument(Base):
    __tablename__ = "kyc_documents"

    id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid4
    )
    attempt_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("kyc_attempts.id", ondelete="CASCADE"), nullable=False, unique=True, index=True
    )
    s3_bucket: Mapped[str] = mapped_column(String(255), nullable=False)
    s3_key: Mapped[str] = mapped_column(String(1024), nullable=False)
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    file_size_bytes: Mapped[Optional[int]] = mapped_column(nullable=True)
    content_type: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    # Relationships
    attempt: Mapped["KYCAttempt"] = relationship("KYCAttempt", back_populates="document")

    def __repr__(self) -> str:  # pragma: no cover - debugging only
        return f"<KYCDocument id={self.id} attempt_id={self.attempt_id} key={self.s3_key}>"


class KYCDecision(Base):
    __tablename__ = "kyc_decisions"

    id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid4
    )
    attempt_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("kyc_attempts.id", ondelete="CASCADE"), nullable=False, unique=True, index=True
    )
    decision: Mapped[str] = mapped_column(String(30), nullable=False)
    # AUTO_VERIFIED, APPROVED, REJECTED, REUPLOAD_REQUESTED
    decided_by: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    # 'SYSTEM' or reviewer cognito_sub
    decided_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Relationships
    attempt: Mapped["KYCAttempt"] = relationship("KYCAttempt", back_populates="decision")

    def __repr__(self) -> str:  # pragma: no cover - debugging only
        return f"<KYCDecision id={self.id} attempt_id={self.attempt_id} decision={self.decision}>"