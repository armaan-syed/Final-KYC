"""Verification-related schemas (shared with OCR worker contract)."""

from typing import Any
from uuid import UUID

from pydantic import BaseModel


# SQS message schema sent by the API and consumed by Person A's OCR worker
class OCRWorkerMessage(BaseModel):
    kyc_attempt_id: UUID
    kyc_case_id: UUID
    customer_id: UUID
    s3_bucket: str
    s3_key: str
    document_type: str  # "AADHAAR" or "PAN"


# What Person A's worker writes back to the database (contract definition)
class WorkerExtractedField(BaseModel):
    field_name: str
    raw_value: str | None = None
    normalized_value: str | None = None
    confidence: float | None = None


class WorkerFieldComparison(BaseModel):
    field_name: str
    customer_value: str | None = None
    document_value: str | None = None
    is_match: bool


class WorkerVerificationResult(BaseModel):
    attempt_id: UUID
    all_required_fields_match: bool
    match_percentage: float | None = None
    extracted_fields: list[WorkerExtractedField]
    field_comparisons: list[WorkerFieldComparison]