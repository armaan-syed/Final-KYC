"""Reviewer request/response schemas."""

from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, Field


class ReviewerDashboardResponse(BaseModel):
    pending_review: int
    auto_verified_today: int
    approved_today: int
    rejected_today: int
    total_cases: int


class QueueCaseSummary(BaseModel):
    kyc_case_id: UUID
    customer_name: str
    document_type: str
    submitted_at: datetime
    mismatched_fields: list[str]
    attempt_number: int

    model_config = {"from_attributes": True}


class ReviewerQueueResponse(BaseModel):
    cases: list[QueueCaseSummary]
    total: int
    page: int
    page_size: int


class FieldComparisonDetail(BaseModel):
    field: str
    customer_value: Optional[str]
    document_value: Optional[str]
    is_match: bool


class ReviewerCaseDetailResponse(BaseModel):
    kyc_case_id: UUID
    customer: dict[str, Any]
    latest_attempt: dict[str, Any]
    attempt_history: list[dict[str, Any]]
    audit_trail: list[dict[str, Any]]

    model_config = {"from_attributes": True}


class ReviewerDecisionRequest(BaseModel):
    decision: str = Field(..., pattern="^(APPROVED|REJECTED|REUPLOAD_REQUESTED)$")
    notes: Optional[str] = Field(None, max_length=1000)


class ReviewerDecisionResponse(BaseModel):
    message: str
    decision: str
    decided_at: datetime


class AuditEventResponse(BaseModel):
    id: UUID
    actor: str
    action: str
    details: Optional[dict[str, Any]]
    created_at: datetime

    model_config = {"from_attributes": True}


class ReviewerAuditResponse(BaseModel):
    kyc_case_id: UUID
    events: list[AuditEventResponse]
    total: int