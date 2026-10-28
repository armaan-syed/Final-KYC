"""SQLAlchemy database engine and session factory."""

import json
from functools import lru_cache

import boto3
from sqlalchemy import create_engine
from sqlalchemy.engine import URL
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import settings


class Base(DeclarativeBase):
    """Base class for all ORM models."""


@lru_cache(maxsize=1)
def _get_database_secret() -> dict[str, str]:
    """Fetch and cache the database secret for this Lambda execution environment."""
    if not settings.rds_secret_arn:
        return {}

    response = boto3.client("secretsmanager", region_name=settings.aws_region).get_secret_value(
        SecretId=settings.rds_secret_arn
    )
    secret_string = response.get("SecretString")
    if not secret_string:
        raise RuntimeError("The configured RDS secret has no SecretString")
    try:
        secret = json.loads(secret_string)
    except json.JSONDecodeError as exc:
        raise RuntimeError("The configured RDS secret must contain a JSON object") from exc
    if not isinstance(secret, dict) or not secret.get("username") or not secret.get("password"):
        raise RuntimeError("The configured RDS secret must contain username and password")
    return secret


def get_database_url() -> URL:
    """Build a safely escaped PostgreSQL URL from local config or Secrets Manager."""
    secret = _get_database_secret()
    password = secret.get("password")
    if password is None and settings.rds_password is not None:
        password = settings.rds_password.get_secret_value()
    username = secret.get("username", settings.rds_username)
    if password is None:
        raise RuntimeError("Database credentials are not configured")

    return URL.create(
        drivername="postgresql+psycopg2",
        username=username,
        password=password,
        host=settings.rds_host,
        port=settings.rds_port,
        database=settings.rds_db_name,
        query={"sslmode": "require"} if settings.rds_secret_arn else {},
    )


engine = create_engine(
    get_database_url(),
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=10,
)

SessionLocal = sessionmaker(
    bind=engine,
    autocommit=False,
    autoflush=False,
)


def get_db():
    """FastAPI dependency that yields a SQLAlchemy session and closes it."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
