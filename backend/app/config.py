"""Application configuration loaded from environment variables.

Never log or return secret values. All required settings are validated
at startup; missing required values raise a clear, non-secret error.
"""

from functools import lru_cache
from typing import List

from pydantic import SecretStr, model_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # AWS
    aws_region: str = "us-east-1"

    # Database (RDS PostgreSQL)
    rds_host: str = "localhost"
    rds_port: int = 5432
    rds_db_name: str = "pramana_kyc"
    rds_username: str = "postgres"
    # Local deployments may supply a password directly. Deployed Lambdas should
    # use Secrets Manager and set RDS_SECRET_ARN instead.
    rds_password: SecretStr | None = None
    rds_secret_arn: str | None = None

    # Cognito - Customer Pool
    cognito_customer_pool_id: str
    cognito_reviewer_pool_id: str
    cognito_app_client_id: str
    cognito_reviewer_app_client_id: str

    # S3 Document Storage
    s3_documents_bucket: str

    # SQS Queue for OCR Worker
    sqs_queue_url: str

    # SES Sender Email
    ses_sender_email: str

    # API
    api_base_url: str = "http://localhost:8000"

    # Supported upload formats (JPEG, PNG, PDF)
    supported_content_types: List[str] = [
        "image/jpeg",
        "image/png",
        "application/pdf",
    ]

    # Presigned URL expiry in seconds
    presigned_url_expiry_seconds: int = 300

    # Presigned GET URL expiry for document preview (seconds)
    presigned_get_url_expiry_seconds: int = 900

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
        "case_sensitive": False,
        "extra": "ignore",
    }

    @model_validator(mode="after")
    def require_database_auth(self) -> "Settings":
        """Require either local password auth or a Secrets Manager secret ARN."""
        if not self.rds_secret_arn and not self.rds_password:
            raise ValueError("Set RDS_SECRET_ARN or RDS_PASSWORD for database access")
        return self


@lru_cache()
def get_settings() -> Settings:
    """Return cached settings instance."""
    return Settings()


settings = get_settings()
