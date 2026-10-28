"""Cognito registration and confirmation routes.

Amplify owns interactive sign-in and token sessions. The customer row in RDS
is created only after successful email confirmation.
"""

import logging
from datetime import date
from uuid import UUID, uuid4

import boto3
from botocore.exceptions import ClientError
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models.customer import Customer
from app.schemas.auth import (
    ConfirmRegistrationRequest,
    ConfirmRegistrationResponse,
    CustomerRegisterRequest,
    CustomerRegisterResponse,
    ErrorResponse,
)

router = APIRouter()
logger = logging.getLogger(__name__)

cognito_idp = boto3.client("cognito-idp", region_name=settings.aws_region)


def _cognito_error_message(exc: ClientError) -> str:
    """Map Cognito ClientError to a safe, non-detail-leaking message."""
    code = exc.response.get("Error", {}).get("Code", "")
    if code in ("UsernameExistsException", "InvalidParameterException"):
        return "An account with this email already exists."
    if code == "CodeMismatchException":
        return "Invalid confirmation code."
    if code == "ExpiredCodeException":
        return "Confirmation code has expired."
    if code == "TooManyRequestsException":
        return "Too many requests. Please try again later."
    if code == "InvalidPasswordException":
        return "Password does not meet complexity requirements."
    return "Authentication service error."


@router.post(
    "/register",
    response_model=CustomerRegisterResponse,
    status_code=status.HTTP_201_CREATED,
    responses={400: {"model": ErrorResponse}, 503: {"model": ErrorResponse}},
)
def register(request: CustomerRegisterRequest):
    """Register a new customer in Cognito.

    Cognito sends a verification code to the customer's email. The customer
    row in RDS is created only after confirmation at /auth/confirm.
    """
    try:
        user_attributes = [
            {"Name": "email", "Value": request.email},
            {"Name": "given_name", "Value": request.full_name},
            {"Name": "phone_number", "Value": request.phone_number},
            {"Name": "custom:date_of_birth", "Value": request.date_of_birth},
            {"Name": "gender", "Value": request.gender},
            {"Name": "custom:address_line1", "Value": request.address_line1},
            {"Name": "custom:city", "Value": request.city},
            {"Name": "custom:state", "Value": request.state},
            {"Name": "custom:pincode", "Value": request.pincode},
        ]
        if request.address_line2:
            user_attributes.append(
                {"Name": "custom:address_line2", "Value": request.address_line2}
            )

        response = cognito_idp.sign_up(
            ClientId=settings.cognito_app_client_id,
            Username=request.email,
            Password=request.password,
            UserAttributes=user_attributes,
        )
    except ClientError as exc:
        logger.error("Cognito sign_up failed: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=_cognito_error_message(exc),
        ) from exc

    return CustomerRegisterResponse(
        message="Registration successful. Please verify your email.",
        cognito_sub=response["UserSub"],
    )


@router.post(
    "/confirm",
    response_model=ConfirmRegistrationResponse,
    responses={400: {"model": ErrorResponse}, 503: {"model": ErrorResponse}},
)
def confirm_registration(
    request: ConfirmRegistrationRequest,
    db: Session = Depends(get_db),
):
    """Confirm registration with the Cognito verification code.

    After confirmation, creates the customers row in RDS.
    """
    try:
        cognito_idp.confirm_sign_up(
            ClientId=settings.cognito_app_client_id,
            Username=request.email,
            ConfirmationCode=request.confirmation_code,
        )
    except ClientError as exc:
        logger.error("Cognito confirm_sign_up failed: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=_cognito_error_message(exc),
        ) from exc

    # Get the Cognito sub for the confirmed user
    try:
        user_response = cognito_idp.admin_get_user(
            UserPoolId=settings.cognito_customer_pool_id,
            Username=request.email,
        )
    except ClientError as exc:
        logger.error("Cognito admin_get_user failed: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Unable to retrieve user profile.",
        ) from exc

    cognito_sub = next(
        (a["Value"] for a in user_response["UserAttributes"] if a["Name"] == "sub"),
        None,
    )

    # Check if customer row already exists
    existing = db.query(Customer).filter_by(email=request.email).first()
    if existing:
        return ConfirmRegistrationResponse(
            message="Account already confirmed.",
            customer_id=str(existing.id),
        )

    # Extract custom attributes
    def _attr(name: str) -> str:
        for a in user_response["UserAttributes"]:
            if a["Name"] == name:
                return a["Value"]
        return ""

    try:
        dob = date.fromisoformat(_attr("custom:date_of_birth"))
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Registration profile has an invalid date of birth.",
        )

    customer = Customer(
        cognito_sub=cognito_sub or str(uuid4()),
        full_name=_attr("given_name") or request.email,
        date_of_birth=dob,
        gender=_attr("gender") or "",
        phone_number=_attr("phone_number") or "",
        email=request.email,
        address_line1=_attr("custom:address_line1") or "",
        address_line2=_attr("custom:address_line2") or None,
        city=_attr("custom:city") or "",
        state=_attr("custom:state") or "",
        pincode=_attr("custom:pincode") or "",
    )
    db.add(customer)
    db.commit()
    db.refresh(customer)

    return ConfirmRegistrationResponse(
        message="Account confirmed successfully.",
        customer_id=str(customer.id),
    )
