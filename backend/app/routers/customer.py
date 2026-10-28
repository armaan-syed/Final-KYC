"""Customer routes: profile and KYC status."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.dependencies import get_current_customer
from app.models.customer import Customer
from app.models.kyc import KYCCase
from app.schemas.customer import (
    CustomerProfileResponse,
    CustomerProfileUpdateRequest,
    CustomerKYCStatusResponse,
)

router = APIRouter()


@router.get(
    "/profile",
    response_model=CustomerProfileResponse,
    responses={404: {"model": dict}},
)
def get_profile(customer: Customer = Depends(get_current_customer)):
    """Get the authenticated customer's profile."""
    return CustomerProfileResponse(
        id=customer.id,
        full_name=customer.full_name,
        date_of_birth=customer.date_of_birth.isoformat(),
        gender=customer.gender,
        phone_number=customer.phone_number,
        email=customer.email,
        address_line1=customer.address_line1,
        address_line2=customer.address_line2,
        city=customer.city,
        state=customer.state,
        pincode=customer.pincode,
        created_at=customer.created_at,
    )


@router.put(
    "/profile",
    response_model=CustomerProfileResponse,
    responses={404: {"model": dict}},
)
def update_profile(
    request: CustomerProfileUpdateRequest,
    customer: Customer = Depends(get_current_customer),
    db: Session = Depends(get_db),
):
    """Update the authenticated customer's profile fields."""
    update_data = request.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(customer, field, value)
    db.commit()
    db.refresh(customer)

    return CustomerProfileResponse(
        id=customer.id,
        full_name=customer.full_name,
        date_of_birth=customer.date_of_birth.isoformat(),
        gender=customer.gender,
        phone_number=customer.phone_number,
        email=customer.email,
        address_line1=customer.address_line1,
        address_line2=customer.address_line2,
        city=customer.city,
        state=customer.state,
        pincode=customer.pincode,
        created_at=customer.created_at,
    )


@router.get(
    "/kyc/status",
    response_model=CustomerKYCStatusResponse,
    responses={404: {"model": dict}},
)
def get_kyc_status(customer: Customer = Depends(get_current_customer), db: Session = Depends(get_db)):
    """Get the customer's current KYC case status and latest attempt summary."""
    case = db.query(KYCCase).filter_by(customer_id=customer.id).first()
    if case is None:
        return CustomerKYCStatusResponse(
            kyc_case_id=UUID(int=0),
            status="PENDING",
            latest_attempt=None,
            rejection_reason=None,
        )

    latest = case.attempts[-1] if case.attempts else None
    latest_attempt = None
    rejection_reason = None
    if latest:
        comparisons = []
        for fc in latest.field_comparisons:
            comparisons.append(
                {
                    "field": fc.field_name,
                    "is_match": fc.is_match,
                }
            )
        latest_attempt = {
            "attempt_number": latest.attempt_number,
            "document_type": latest.document_type,
            "submitted_at": latest.submitted_at.isoformat(),
            "status": latest.status,
            "field_comparisons": comparisons,
        }
        if case.status == "REJECTED":
            mismatch = [fc.field_name for fc in latest.field_comparisons if not fc.is_match]
            rejection_reason = (
                f"{', '.join(mismatch)} mismatch" if mismatch else "KYC rejected"
            )

    return CustomerKYCStatusResponse(
        kyc_case_id=case.id,
        status=case.status,
        latest_attempt=latest_attempt,
        rejection_reason=rejection_reason,
    )