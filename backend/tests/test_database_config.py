from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from pydantic import SecretStr, ValidationError

from app.config import Settings
import app.database as database


def _required_settings(**overrides):
    values = {
        "_env_file": None,
        "cognito_customer_pool_id": "customer-pool",
        "cognito_reviewer_pool_id": "reviewer-pool",
        "cognito_app_client_id": "customer-client",
        "cognito_reviewer_app_client_id": "reviewer-client",
        "s3_documents_bucket": "documents",
        "sqs_queue_url": "https://sqs.example.com/test",
    }
    values.update(overrides)
    return values


def test_settings_reject_missing_database_auth():
    with pytest.raises(ValidationError, match="RDS_SECRET_ARN or RDS_PASSWORD"):
        Settings(**_required_settings(rds_password=None, rds_secret_arn=None))


def test_settings_accept_secrets_manager_arn():
    settings = Settings(
        **_required_settings(
            rds_password=None,
            rds_secret_arn="arn:aws:secretsmanager:us-east-1:000000000000:secret:db",
        )
    )
    assert settings.rds_secret_arn.endswith(":db")
    assert settings.rds_password is None


def test_database_url_escapes_local_credentials(monkeypatch):
    monkeypatch.setattr(
        database,
        "settings",
        SimpleNamespace(
            rds_secret_arn=None,
            rds_password=SecretStr("p@ss/wo:rd"),
            rds_username="user@name",
            rds_host="db.example.test",
            rds_port=5432,
            rds_db_name="pramana_kyc",
        ),
    )
    database._get_database_secret.cache_clear()

    url = database.get_database_url()

    assert url.username == "user@name"
    assert url.password == "p@ss/wo:rd"
    assert url.host == "db.example.test"
    assert url.database == "pramana_kyc"


def test_database_url_reads_secrets_manager_with_verified_tls(monkeypatch, tmp_path):
    secret_client = MagicMock()
    secret_client.get_secret_value.return_value = {
        "SecretString": '{"username":"db-user","password":"secret-value"}'
    }
    monkeypatch.setattr(database.boto3, "client", MagicMock(return_value=secret_client))
    ca_bundle = tmp_path / "global-bundle.pem"
    ca_bundle.write_text("test CA bundle")
    monkeypatch.setenv("RDS_CA_BUNDLE", str(ca_bundle))
    monkeypatch.setattr(
        database,
        "settings",
        SimpleNamespace(
            rds_secret_arn="arn:aws:secretsmanager:us-east-1:000000000000:secret:db",
            rds_password=None,
            rds_username="unused",
            rds_host="db.example.test",
            rds_port=5432,
            rds_db_name="pramana_kyc",
            aws_region="us-east-1",
        ),
    )
    database._get_database_secret.cache_clear()

    url, connect_args = database.get_database_config()

    assert url.username == "db-user"
    assert url.password == "secret-value"
    assert connect_args == {"sslmode": "verify-full", "sslrootcert": str(ca_bundle)}
    secret_client.get_secret_value.assert_called_once()
    database._get_database_secret.cache_clear()
