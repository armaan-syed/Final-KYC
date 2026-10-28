"""Auth request/response schemas."""

from datetime import date

from pydantic import BaseModel, EmailStr, Field
from pydantic import field_validator


class CustomerRegisterRequest(BaseModel):
    full_name: str = Field(..., min_length=1, max_length=255)
    date_of_birth: str  # ISO date string YYYY-MM-DD
    gender: str = Field(..., min_length=1, max_length=20)
    phone_number: str = Field(..., min_length=1, max_length=20)
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)
    address_line1: str = Field(..., min_length=1, max_length=255)
    address_line2: str | None = Field(None, max_length=255)
    city: str = Field(..., min_length=1, max_length=100)
    state: str = Field(..., min_length=1, max_length=100)
    pincode: str = Field(..., min_length=1, max_length=10)

    @field_validator("date_of_birth")
    @classmethod
    def validate_date_of_birth(cls, value: str) -> str:
        try:
            parsed = date.fromisoformat(value)
        except ValueError as exc:
            raise ValueError("date_of_birth must be a valid YYYY-MM-DD date") from exc
        if parsed.isoformat() != value:
            raise ValueError("date_of_birth must use YYYY-MM-DD format")
        return value


class CustomerRegisterResponse(BaseModel):
    message: str
    cognito_sub: str


class ConfirmRegistrationRequest(BaseModel):
    email: EmailStr
    confirmation_code: str = Field(..., min_length=6, max_length=6)


class ConfirmRegistrationResponse(BaseModel):
    message: str
    customer_id: str


class ErrorResponse(BaseModel):
    detail: str
