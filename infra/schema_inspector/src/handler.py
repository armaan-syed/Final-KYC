"""Fixed, read-only PostgreSQL catalog report for project administrators."""

from __future__ import annotations

import json
import logging
import os

import boto3
import psycopg2
from botocore.exceptions import ClientError

logger = logging.getLogger()
logger.setLevel(logging.INFO)

_secrets = boto3.client("secretsmanager")


def _read_database_secret() -> dict[str, str]:
    response = _secrets.get_secret_value(SecretId=os.environ["DATABASE_SECRET_ARN"])
    secret_string = response.get("SecretString")
    if not secret_string:
        raise ValueError("Database secret has no SecretString")

    secret = json.loads(secret_string)
    if not isinstance(secret, dict):
        raise ValueError("Database secret is not a JSON object")
    if not secret.get("username") or not secret.get("password"):
        raise ValueError("Database secret is missing required connection fields")
    return secret


def _build_report(connection) -> dict[str, object]:
    with connection.cursor() as cursor:
        cursor.execute("BEGIN READ ONLY")

        cursor.execute(
            """
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
              AND table_type = 'BASE TABLE'
              AND table_name <> 'alembic_version'
            ORDER BY table_name
            """
        )
        application_tables = [row[0] for row in cursor.fetchall()]

        cursor.execute("SELECT to_regclass('public.alembic_version') IS NOT NULL")
        has_alembic_table = cursor.fetchone()[0]
        revisions: list[str] = []
        if has_alembic_table:
            cursor.execute("SELECT version_num FROM public.alembic_version ORDER BY version_num")
            revisions = [row[0] for row in cursor.fetchall()]

        cursor.execute(
            """
            SELECT data_type, is_nullable
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'customers'
              AND column_name = 'date_of_birth'
            """
        )
        date_of_birth_column = cursor.fetchone()

    return {
        "status": "ok",
        "database": os.environ["DATABASE_NAME"],
        "alembic_revisions": revisions,
        "application_tables": application_tables,
        "application_table_count": len(application_tables),
        "customers_date_of_birth": (
            {"data_type": date_of_birth_column[0], "is_nullable": date_of_birth_column[1]}
            if date_of_birth_column
            else None
        ),
    }


def lambda_handler(event, context) -> dict[str, object]:
    """Return schema metadata only; the event cannot supply SQL or identifiers."""
    connection = None
    try:
        secret = _read_database_secret()
        connection = psycopg2.connect(
            host=secret.get("host") or os.environ["DATABASE_HOST"],
            port=int(secret.get("port") or os.environ["DATABASE_PORT"]),
            dbname=secret.get("dbname") or secret.get("database") or os.environ["DATABASE_NAME"],
            user=secret["username"],
            password=secret["password"],
            connect_timeout=5,
            sslmode="verify-full",
            sslrootcert=os.environ["RDS_CA_BUNDLE"],
            application_name="pramana-schema-inspector",
        )
        connection.set_session(readonly=True, autocommit=False)
        return _build_report(connection)
    except ClientError as exc:
        error_code = exc.response.get("Error", {}).get("Code", "Unknown")
        logger.error("Schema report could not read the configured secret; AWS error code=%s", error_code)
        return {"status": "error", "message": "Unable to read the configured database secret."}
    except psycopg2.Error as exc:
        logger.error("Schema report database query failed; SQLSTATE=%s", exc.pgcode or "unknown")
        return {"status": "error", "message": "Unable to query the database schema."}
    except Exception as exc:
        logger.error("Schema report failed; exception type=%s", type(exc).__name__)
        return {"status": "error", "message": "Schema report failed; check sanitized execution logs."}
    finally:
        if connection is not None:
            connection.close()
