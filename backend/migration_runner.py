"""Explicit one-shot Lambda handler for the Alembic database migration."""

from alembic import command
from alembic.config import Config
from sqlalchemy import text


EXPECTED_APPLICATION_TABLES = {
    "customers",
    "kyc_cases",
    "kyc_attempts",
    "kyc_documents",
    "extracted_fields",
    "field_comparisons",
    "kyc_decisions",
    "audit_events",
    "reviewers",
}


def handler(_event, _context):
    """Apply all migrations, then verify the expected initial catalog."""
    # Import inside the handler so the module can be inspected without AWS
    # access; this loads the normal Secrets Manager and verified TLS settings.
    from app.database import engine

    command.upgrade(Config("/var/task/alembic.ini"), "head")

    with engine.connect() as connection:
        revision = connection.execute(
            text("SELECT version_num FROM public.alembic_version")
        ).scalar_one_or_none()
        tables = set(
            connection.execute(
                text(
                    "SELECT table_name FROM information_schema.tables "
                    "WHERE table_schema = 'public' AND table_type = 'BASE TABLE'"
                )
            ).scalars()
        )
        dob_type = connection.execute(
            text(
                "SELECT data_type FROM information_schema.columns "
                "WHERE table_schema = 'public' AND table_name = 'customers' "
                "AND column_name = 'date_of_birth'"
            )
        ).scalar_one_or_none()

    missing_tables = sorted(EXPECTED_APPLICATION_TABLES - tables)
    if revision != "001_initial_schema" or missing_tables or dob_type != "date":
        raise RuntimeError(
            "Migration verification failed: "
            f"revision={revision!r}, missing_tables={missing_tables!r}, "
            f"date_of_birth_type={dob_type!r}"
        )

    return {
        "status": "verified",
        "revision": revision,
        "application_tables": sorted(EXPECTED_APPLICATION_TABLES),
        "date_of_birth_type": dob_type,
    }
