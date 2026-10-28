"""Auth request/response schemas."""

from pydantic import BaseModel, EmailStr, Field


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


class CustomerRegisterResponse(BaseModel):
    message: str
    cognito_sub: str


class ConfirmRegistrationRequest(BaseModel):
    email: EmailStr
    confirmation_code: str = Field(..., min_length=6, max_length=6)


class ConfirmRegistrationResponse(BaseModel):
    message: str
    customer_id: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class LoginResponse(BaseModel):
    access_token: str
    refresh_token: str
    id_token: str
    token_type: str = "Bearer"
    expires_in: int


class RefreshRequest(BaseModel):
    refresh_token: str


class RefreshResponse(BaseModel):
    access_token: str
    id_token: str
    token_type: str = "Bearer"
    expires_in: int


class LogoutResponse(BaseModel):
    message: str


class ErrorResponse(BaseModel):
    detail: str