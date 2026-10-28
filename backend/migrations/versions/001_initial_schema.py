"""Initial schema for Pramāṇa KYC verification system.

Creates all tables: customers, kyc_cases, kyc_attempts, kyc_documents,
extracted_fields, field_comparisons, kyc_decisions, audit_events, reviewers.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "001_initial_schema"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Enable pgcrypto for gen_random_uuid()
    op.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")

    # --- customers ---
    op.create_table(
        "customers",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False, default=sa.text("gen_random_uuid()")),
        sa.Column("cognito_sub", sa.String(length=255), nullable=False),
        sa.Column("full_name", sa.String(length=255), nullable=False),
        sa.Column("date_of_birth", sa.DateTime(timezone=True), nullable=False),
        sa.Column("gender", sa.String(length=20), nullable=False),
        sa.Column("phone_number", sa.String(length=20), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("address_line1", sa.String(length=255), nullable=False),
        sa.Column("address_line2", sa.String(length=255), nullable=True),
        sa.Column("city", sa.String(length=100), nullable=False),
        sa.Column("state", sa.String(length=100), nullable=False),
        sa.Column("pincode", sa.String(length=10), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("cognito_sub", name="uq_customers_cognito_sub"),
        sa.UniqueConstraint("email", name="uq_customers_email"),
    )
    op.create_index("idx_customers_cognito_sub", "customers", ["cognito_sub"])
    op.create_index("idx_customers_email", "customers", ["email"])

    # --- kyc_cases ---
    op.create_table(
        "kyc_cases",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False, default=sa.text("gen_random_uuid()")),
        sa.Column("customer_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("status", sa.String(length=30), nullable=False, server_default="PENDING"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["customer_id"], ["customers.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("customer_id", name="uq_customer_kyc_case"),
    )
    op.create_index("idx_kyc_cases_customer_id", "kyc_cases", ["customer_id"])
    op.create_index("idx_kyc_cases_status", "kyc_cases", ["status"])

    # --- kyc_attempts ---
    op.create_table(
        "kyc_attempts",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False, default=sa.text("gen_random_uuid()")),
        sa.Column("kyc_case_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("attempt_number", sa.Integer(), nullable=False),
        sa.Column("document_type", sa.String(length=20), nullable=False),
        sa.Column("status", sa.String(length=30), nullable=False, server_default="PROCESSING"),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["kyc_case_id"], ["kyc_cases.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("kyc_case_id", "attempt_number", name="uq_attempt_number"),
    )
    op.create_index("idx_kyc_attempts_case_id", "kyc_attempts", ["kyc_case_id"])
    op.create_index("idx_kyc_attempts_status", "kyc_attempts", ["status"])

    # --- kyc_documents ---
    op.create_table(
        "kyc_documents",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False, default=sa.text("gen_random_uuid()")),
        sa.Column("attempt_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("s3_bucket", sa.String(length=255), nullable=False),
        sa.Column("s3_key", sa.String(length=1024), nullable=False),
        sa.Column("file_name", sa.String(length=255), nullable=False),
        sa.Column("file_size_bytes", sa.Integer(), nullable=True),
        sa.Column("content_type", sa.String(length=100), nullable=True),
        sa.Column("uploaded_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["attempt_id"], ["kyc_attempts.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("attempt_id", name="uq_kyc_documents_attempt_id"),
    )
    op.create_index("idx_kyc_documents_attempt_id", "kyc_documents", ["attempt_id"])

    # --- extracted_fields ---
    op.create_table(
        "extracted_fields",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False, default=sa.text("gen_random_uuid()")),
        sa.Column("attempt_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("field_name", sa.String(length=100), nullable=False),
        sa.Column("raw_value", sa.Text(), nullable=True),
        sa.Column("normalized_value", sa.Text(), nullable=True),
        sa.Column("confidence", sa.Float(), nullable=True),
        sa.Column("extracted_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["attempt_id"], ["kyc_attempts.id"], ondelete="CASCADE"),
    )
    op.create_index("idx_extracted_fields_attempt_id", "extracted_fields", ["attempt_id"])

    # --- field_comparisons ---
    op.create_table(
        "field_comparisons",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False, default=sa.text("gen_random_uuid()")),
        sa.Column("attempt_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("field_name", sa.String(length=100), nullable=False),
        sa.Column("customer_value", sa.Text(), nullable=True),
        sa.Column("document_value", sa.Text(), nullable=True),
        sa.Column("is_match", sa.Boolean(), nullable=False),
        sa.Column("compared_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["attempt_id"], ["kyc_attempts.id"], ondelete="CASCADE"),
    )
    op.create_index("idx_field_comparisons_attempt_id", "field_comparisons", ["attempt_id"])

    # --- kyc_decisions ---
    op.create_table(
        "kyc_decisions",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False, default=sa.text("gen_random_uuid()")),
        sa.Column("attempt_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("decision", sa.String(length=30), nullable=False),
        sa.Column("decided_by", sa.String(length=255), nullable=True),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["attempt_id"], ["kyc_attempts.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("attempt_id", name="uq_kyc_decisions_attempt_id"),
    )

    # --- audit_events ---
    op.create_table(
        "audit_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False, default=sa.text("gen_random_uuid()")),
        sa.Column("kyc_case_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("attempt_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("actor", sa.String(length=255), nullable=False),
        sa.Column("action", sa.String(length=100), nullable=False),
        sa.Column("details", postgresql.JSONB(as_text_type=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["kyc_case_id"], ["kyc_cases.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["attempt_id"], ["kyc_attempts.id"], ondelete="CASCADE"),
    )
    op.create_index("idx_audit_events_case_id", "audit_events", ["kyc_case_id"])
    op.create_index("idx_audit_events_created_at", "audit_events", ["created_at"])

    # --- reviewers ---
    op.create_table(
        "reviewers",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False, default=sa.text("gen_random_uuid()")),
        sa.Column("cognito_sub", sa.String(length=255), nullable=False),
        sa.Column("full_name", sa.String(length=255), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("cognito_sub", name="uq_reviewers_cognito_sub"),
        sa.UniqueConstraint("email", name="uq_reviewers_email"),
    )


def downgrade() -> None:
    op.drop_table("reviewers")
    op.drop_table("audit_events")
    op.drop_table("kyc_decisions")
    op.drop_table("field_comparisons")
    op.drop_table("extracted_fields")
    op.drop_table("kyc_documents")
    op.drop_table("kyc_attempts")
    op.drop_table("kyc_cases")
    op.drop_table("customers")
    op.execute("DROP EXTENSION IF EXISTS pgcrypto")