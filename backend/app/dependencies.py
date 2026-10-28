"""Shared FastAPI dependencies: database session and authentication."""

from typing import Annotated

from fastapi import Depends, HTTPException, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.config import settings
from app.database import SessionLocal, get_db as _get_db
from app.models.customer import Customer
from app.models.reviewer import Reviewer
from app.services.cognito import verify_token

security = HTTPBearer()


def get_db() -> Session:
    """Yield a SQLAlchemy session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


async def get_current_customer(
    credentials: Annotated[HTTPAuthorizationCredentials, Security(security)],
    db: Session = Depends(get_db),
) -> Customer:
    """Validate a customer JWT and return the Customer record."""
    try:
        payload = verify_token(credentials.credentials, user_pool="customers")
    except HTTPException:
        raise

    sub = payload.get("sub")
    if not sub:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token: missing subject",
        )

    customer = db.query(Customer).filter_by(cognito_sub=sub).first()
    if not customer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Customer not found",
        )
    return customer


async def get_current_reviewer(
    credentials: Annotated[HTTPAuthorizationCredentials, Security(security)],
    db: Session = Depends(get_db),
) -> Reviewer:
    """Validate a reviewer JWT and return the Reviewer record."""
    try:
        payload = verify_token(credentials.credentials, user_pool="reviewers")
    except HTTPException:
        raise

    sub = payload.get("sub")
    if not sub:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token: missing subject",
        )

    reviewer = db.query(Reviewer).filter_by(cognito_sub=sub).first()
    if not reviewer:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized as reviewer",
        )
    if not reviewer.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Reviewer account is inactive",
        )
    return reviewer