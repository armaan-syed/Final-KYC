"""KYC routes: upload URL, submit, and attempt history."""

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.dependencies import get_current_customer
from app.models.customer import Customer
from app.models.kyc import KYCAttempt, KYCCase, KYCDocument
from app.schemas.kyc import (
    SubmitKYCRequest,
    SubmitKYCResponse,
    UploadURLRequest,
    UploadURLResponse,
    KYCAttemptsResponse,
    KYCAttemptResponse,
    FieldComparisonSummary,
)
from app.services.kyc_service import KYCService
from app.services.s3 import generate_presigned_get_url

router = APIRouter()


@router.post(
    "/upload-url",
    response_model=UploadURLResponse,
    responses={400: {"model": dict}, 503: {"model": dict}},
)
def get_upload_url(
    request: UploadURLRequest,
    customer: Customer = Depends(get_current_customer),
    db: Session = Depends(get_db),
):
    """Generate a presigned S3 URL for document upload and allocate an attempt."""
    service = KYCService(db)
    case = service.get_or_create_case(customer)
    return service.create_upload_url(
        customer=customer,
        case=case,
        document_type=request.document_type,
        file_name=request.file_name,
        content_type=request.content_type,
    )


@router.post(
    "/submit",
    response_model=SubmitKYCResponse,
    status_code=status.HTTP_201_CREATED,
    responses={400: {"model": dict}, 409: {"model": dict}, 503: {"model": dict}},
)
def submit_kyc(
    request: SubmitKYCRequest,
    customer: Customer = Depends(get_current_customer),
    db: Session = Depends(get_db),
):
    """Submit a KYC document for verification.

    The client must have already uploaded the file to S3 using the presigned
    URL from /kyc/upload-url. This endpoint validates ownership, persists the
    document metadata, and enqueues exactly one OCR worker job via SQS.
    """
    service = KYCService(db)
    case = service.get_or_create_case(customer)

    # Find the most recent attempt matching this document_type
    attempt = (
        db.query(KYCAttempt)
        .filter_by(kyc_case_id=case.id, document_type=request.document_type)
        .order_by(KYCAttempt.attempt_number.desc())
        .first()
    )
    if attempt is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No upload URL was requested for this document type. Call /kyc/upload-url first.",
        )

    # Verify the s3_key matches the derived key for this attempt/customer
    from app.services.s3 import derive_s3_key

    expected_key = derive_s3_key(str(customer.id), str(attempt.id), request.file_name)
    if request.s3_key != expected_key:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The s3_key does not match the allocated upload key.",
        )

    try:
        return service.submit_kyc(
            customer=customer,
            case=case,
            attempt_id=attempt.id,
            document_type=request.document_type,
            file_name=request.file_name,
            file_size_bytes=request.file_size_bytes,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.get(
    "/attempts",
    response_model=KYCAttemptsResponse,
    responses={404: {"model": dict}},
)
def list_attempts(customer: Customer = Depends(get_current_customer), db: Session = Depends(get_db)):
    """List all KYC attempts for the customer's case, newest first."""
    case = db.query(KYCCase).filter_by(customer_id=customer.id).first()
    if case is None:
        return KYCAttemptsResponse(attempts=[], total=0)

    attempts = case.attempts  # already ordered by attempt_number
    items = []
    for a in attempts:
        comparisons = [
            FieldComparisonSummary(
                field=fc.field_name,
                customer_value=fc.customer_value,
                document_value=fc.document_value,
                is_match=fc.is_match,
            )
            for fc in a.field_comparisons
        ]
        items.append(
            KYCAttemptResponse(
                attempt_id=a.id,
                attempt_number=a.attempt_number,
                document_type=a.document_type,
                status=a.status,
                submitted_at=a.submitted_at,
                completed_at=a.completed_at,
                field_comparisons=comparisons,
            )
        )

    return KYCAttemptsResponse(attempts=items, total=len(items))