"""SQLAlchemy database engine and session factory."""

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import settings


class Base(DeclarativeBase):
    """Base class for all ORM models."""


def get_database_url() -> str:
    """Build the PostgreSQL database URL from settings."""
    return (
        f"postgresql+psycopg2://{settings.rds_username}:{settings.rds_password}"
        f"@{settings.rds_host}:{settings.rds_port}/{settings.rds_db_name}"
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