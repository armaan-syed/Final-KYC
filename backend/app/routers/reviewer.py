"""Reviewer routes: dashboard, queue, case detail, decisions, audit."""

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session, joinedload

from app.config import settings
from app.database import get_db
from app.dependencies import get_current_reviewer
from app.models.audit import AuditEvent
from app.models.customer import Customer
from app.models.kyc import KYCAttempt, KYCCase, KYCDecision, KYCDocument
from app.models.reviewer import Reviewer
from app.schemas.reviewer import (
    ReviewerDashboardResponse,
    ReviewerQueueResponse,
    QueueCaseSummary,
    ReviewerCaseDetailResponse,
    ReviewerDecisionRequest,
    ReviewerDecisionResponse,
    ReviewerAuditResponse,
    AuditEventResponse,
)
from app.services.kyc_service import KYCService
from app.services.s3 import generate_presigned_get_url

router = APIRouter()


@router.get(
    "/dashboard",
    response_model=ReviewerDashboardResponse,
)
def get_dashboard(
    reviewer: Reviewer = Depends(get_current_reviewer),
    db: Session = Depends(get_db),
):
    """Get reviewer dashboard summary counts."""
    total_cases = db.query(KYCCase).count()
    pending_review = (
        db.query(KYCCase)
        .filter(KYCCase.status.in_(["REVIEW_REQUIRED", "REUPLOAD_PENDING"]))
        .count()
    )
    auto_verified_today = (
        db.query(KYCCase)
        .filter(KYCCase.status == "AUTO_VERIFIED")
        .count()
    )
    approved_today = db.query(KYCCase).filter(KYCCase.status == "APPROVED").count()
    rejected_today = db.query(KYCCase).filter(KYCCase.status == "REJECTED").count()

    return ReviewerDashboardResponse(
        pending_review=pending_review,
        auto_verified_today=auto_verified_today,
        approved_today=approved_today,
        rejected_today=rejected_today,
        total_cases=total_cases,
    )


@router.get(
    "/queue",
    response_model=ReviewerQueueResponse,
)
def get_review_queue(
    reviewer: Reviewer = Depends(get_current_reviewer),
    db: Session = Depends(get_db),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    """Get paginated list of cases requiring manual review."""
    query = (
        db.query(KYCCase)
        .options(joinedload(KYCCase.attempts).joinedload(KYCAttempt.field_comparisons))
        .filter(KYCCase.status.in_(["REVIEW_REQUIRED", "REUPLOAD_PENDING"]))
        .order_by(KYCCase.updated_at.desc())
    )

    total = query.count()
    offset = (page - 1) * page_size
    cases = query.offset(offset).limit(page_size).all()

    items = []
    for case in cases:
        latest = case.attempts[-1] if case.attempts else None
        if not latest:
            continue
        mismatched = [
            fc.field_name for fc in latest.field_comparisons if not fc.is_match
        ]
        customer = db.query(Customer).filter_by(id=case.customer_id).first()
        items.append(
            QueueCaseSummary(
                kyc_case_id=case.id,
                customer_name=customer.full_name if customer else "Unknown",
                document_type=latest.document_type,
                submitted_at=latest.submitted_at,
                mismatched_fields=mismatched,
                attempt_number=latest.attempt_number,
            )
        )

    return ReviewerQueueResponse(
        cases=items,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get(
    "/cases",
)
def list_cases(
    reviewer: Reviewer = Depends(get_current_reviewer),
    db: Session = Depends(get_db),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: Optional[str] = Query(None),
):
    """List all KYC cases with optional status filter."""
    query = db.query(KYCCase).order_by(KYCCase.updated_at.desc())
    if status:
        query = query.filter(KYCCase.status == status)

    total = query.count()
    offset = (page - 1) * page_size
    cases = query.offset(offset).limit(page_size).all()

    return {
        "cases": [
            {
                "kyc_case_id": str(c.id),
                "customer_id": str(c.customer_id),
                "status": c.status,
                "updated_at": c.updated_at.isoformat(),
            }
            for c in cases
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.get(
    "/cases/{case_id}",
    response_model=ReviewerCaseDetailResponse,
    responses={404: {"model": dict}},
)
def get_case_detail(
    case_id: UUID,
    reviewer: Reviewer = Depends(get_current_reviewer),
    db: Session = Depends(get_db),
):
    """Get full case detail for a reviewer, including customer, attempts, and audit."""
    case = db.query(KYCCase).filter_by(id=case_id).first()
    if case is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Case not found",
        )

    customer = db.query(Customer).filter_by(id=case.customer_id).first()
    if customer is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Customer not found",
        )

    # Latest attempt
    latest = case.attempts[-1] if case.attempts else None

    # Build extracted fields dict
    extracted_fields = {}
    field_comparisons = []
    if latest:
        for ef in latest.extracted_fields:
            extracted_fields[ef.field_name] = {
                "raw_value": ef.raw_value,
                "normalized_value": ef.normalized_value,
                "confidence": ef.confidence,
            }
        for fc in latest.field_comparisons:
            field_comparisons.append(
                {
                    "field": fc.field_name,
                    "customer_value": fc.customer_value,
                    "document_value": fc.document_value,
                    "is_match": fc.is_match,
                }
            )

    # Document preview URL
    document_url = None
    if latest and latest.document:
        document_url = generate_presigned_get_url(latest.document.s3_key)

    # Attempt history
    attempt_history = []
    for a in case.attempts:
        decision = db.query(KYCDecision).filter_by(attempt_id=a.id).first()
        attempt_history.append(
            {
                "attempt_number": a.attempt_number,
                "document_type": a.document_type,
                "status": a.status,
                "submitted_at": a.submitted_at.isoformat(),
                "completed_at": a.completed_at.isoformat() if a.completed_at else None,
                "decision": decision.decision if decision else None,
            }
        )

    # Audit trail
    audit_events = (
        db.query(AuditEvent)
        .filter_by(kyc_case_id=case.id)
        .order_by(AuditEvent.created_at.asc())
        .all()
    )
    audit_trail = [
        {
            "actor": e.actor,
            "action": e.action,
            "details": e.details,
            "created_at": e.created_at.isoformat(),
        }
        for e in audit_events
    ]

    return ReviewerCaseDetailResponse(
        kyc_case_id=case.id,
        customer={
            "full_name": customer.full_name,
            "date_of_birth": customer.date_of_birth.isoformat(),
            "gender": customer.gender,
            "address": f"{customer.address_line1}, {customer.city}, {customer.state} {customer.pincode}",
            "email": customer.email,
            "phone_number": customer.phone_number,
        },
        latest_attempt={
            "attempt_number": latest.attempt_number if latest else None,
            "document_type": latest.document_type if latest else None,
            "document_url": document_url,
            "extracted_fields": extracted_fields,
            "field_comparisons": field_comparisons,
            "status": latest.status if latest else None,
        },
        attempt_history=attempt_history,
        audit_trail=audit_trail,
    )


@router.post(
    "/cases/{case_id}/decide",
    response_model=ReviewerDecisionResponse,
    responses={400: {"model": dict}, 404: {"model": dict}, 403: {"model": dict}},
)
def decide_case(
    case_id: UUID,
    request: ReviewerDecisionRequest,
    reviewer: Reviewer = Depends(get_current_reviewer),
    db: Session = Depends(get_db),
):
    """Submit a reviewer decision (APPROVED, REJECTED, or REUPLOAD_REQUESTED)."""
    case = db.query(KYCCase).filter_by(id=case_id).first()
    if case is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Case not found",
        )

    latest = case.attempts[-1] if case.attempts else None
    if latest is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No attempts found for this case",
        )

    service = KYCService(db)
    try:
        result = service.record_decision(
            case=case,
            attempt=latest,
            reviewer=reviewer,
            decision=request.decision,
            notes=request.notes,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    return ReviewerDecisionResponse(
        message=result["message"],
        decision=result["decision"],
        decided_at=result["decided_at"],
    )


@router.get(
    "/cases/{case_id}/audit",
    response_model=ReviewerAuditResponse,
    responses={404: {"model": dict}},
)
def get_case_audit(
    case_id: UUID,
    reviewer: Reviewer = Depends(get_current_reviewer),
    db: Session = Depends(get_db),
):
    """Get the audit trail for a case."""
    case = db.query(KYCCase).filter_by(id=case_id).first()
    if case is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Case not found",
        )

    events = (
        db.query(AuditEvent)
        .filter_by(kyc_case_id=case.id)
        .order_by(AuditEvent.created_at.asc())
        .all()
    )

    return ReviewerAuditResponse(
        kyc_case_id=case.id,
        events=events,
        total=len(events),
    )