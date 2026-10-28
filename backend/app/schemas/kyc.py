"""KYC request/response schemas."""

from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, Field


class UploadURLRequest(BaseModel):
    document_type: str = Field(..., pattern="^(AADHAAR|PAN)$")
    file_name: str = Field(..., min_length=1, max_length=255)
    content_type: str = Field(..., pattern="^(image/jpeg|image/png|application/pdf)$")


class UploadURLResponse(BaseModel):
    upload_url: str
    s3_key: str
    expires_in: int


class SubmitKYCRequest(BaseModel):
    s3_key: str = Field(..., min_length=1, max_length=1024)
    document_type: str = Field(..., pattern="^(AADHAAR|PAN)$")
    file_name: str = Field(..., min_length=1, max_length=255)
    file_size_bytes: Optional[int] = Field(None, ge=0)


class FieldComparisonSummary(BaseModel):
    field: str
    customer_value: Optional[str]
    document_value: Optional[str]
    is_match: bool


class KYCAttemptResponse(BaseModel):
    attempt_id: UUID
    attempt_number: int
    document_type: str
    status: str
    submitted_at: datetime
    completed_at: Optional[datetime] = None
    field_comparisons: list[FieldComparisonSummary] = []

    model_config = {"from_attributes": True}


class SubmitKYCResponse(BaseModel):
    attempt_id: UUID
    attempt_number: int
    status: str
    message: str


class KYCAttemptsResponse(BaseModel):
    attempts: list[KYCAttemptResponse]
    total: int