"""ExtractedField and FieldComparison ORM models."""

from datetime import datetime
from typing import Optional
from uuid import UUID, uuid4

from sqlalchemy import DateTime, ForeignKey, Float, String, Text, func
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class ExtractedField(Base):
    __tablename__ = "extracted_fields"

    id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid4
    )
    attempt_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("kyc_attempts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    field_name: Mapped[str] = mapped_column(String(100), nullable=False)
    # name, date_of_birth, gender, address, id_number, etc.
    raw_value: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    normalized_value: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    confidence: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    extracted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    # Relationships
    attempt: Mapped["KYCAttempt"] = relationship("KYCAttempt", back_populates="extracted_fields")

    def __repr__(self) -> str:  # pragma: no cover - debugging only
        return f"<ExtractedField id={self.id} field={self.field_name} attempt_id={self.attempt_id}>"


class FieldComparison(Base):
    __tablename__ = "field_comparisons"

    id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid4
    )
    attempt_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("kyc_attempts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    field_name: Mapped[str] = mapped_column(String(100), nullable=False)
    customer_value: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    document_value: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_match: Mapped[bool] = mapped_column(nullable=False)
    compared_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    # Relationships
    attempt: Mapped["KYCAttempt"] = relationship("KYCAttempt", back_populates="field_comparisons")

    def __repr__(self) -> str:  # pragma: no cover - debugging only
        return f"<FieldComparison id={self.id} field={self.field_name} is_match={self.is_match}>"