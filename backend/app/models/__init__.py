"""ORM models package.

Import all model modules so SQLAlchemy can resolve string-based relationships
when any model is instantiated (including in focused tests and Alembic).
"""

from app.models import audit, customer, kyc, reviewer, verification  # noqa: F401
