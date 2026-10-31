"""Customer request/response schemas."""

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


class CustomerProfileResponse(BaseModel):
    id: UUID
    full_name: str
    date_of_birth: str  # ISO date string
    gender: str
    phone_number: str
    email: EmailStr
    address_line1: str
    address_line2: Optional[str]
    city: str
    state: str
    pincode: str
    created_at: datetime

    model_config = {"from_attributes": True}


class CustomerProfileUpdateRequest(BaseModel):
    full_name: Optional[str] = Field(None, min_length=1, max_length=255)
    gender: Optional[str] = Field(None, min_length=1, max_length=20)
    phone_number: Optional[str] = Field(None, min_length=1, max_length=20)
    address_line1: Optional[str] = Field(None, min_length=1, max_length=255)
    address_line2: Optional[str] = Field(None, max_length=255)
    city: Optional[str] = Field(None, min_length=1, max_length=100)
    state: Optional[str] = Field(None, min_length=1, max_length=100)
    pincode: Optional[str] = Field(None, min_length=1, max_length=10)


class CustomerKYCStatusResponse(BaseModel):
    kyc_case_id: UUID
    status: str
    upload_allowed: bool
    latest_attempt: Optional[dict] = None
    rejection_reason: Optional[str] = None
