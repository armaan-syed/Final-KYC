import time

import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import HTTPException
from jose import jwt
from jose.utils import base64url_encode

from app.services import cognito


@pytest.fixture
def signed_token(monkeypatch):
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    public_numbers = private_key.public_key().public_numbers()

    def encode_int(value: int) -> str:
        raw = value.to_bytes((value.bit_length() + 7) // 8, "big")
        return base64url_encode(raw).decode("ascii")

    jwk = {
        "kty": "RSA",
        "kid": "unit-test-key",
        "use": "sig",
        "alg": "RS256",
        "n": encode_int(public_numbers.n),
        "e": encode_int(public_numbers.e),
    }
    monkeypatch.setattr(cognito, "_fetch_jwks", lambda _pool_id, _region: {"keys": [jwk]})

    def issue(**overrides):
        now = int(time.time())
        claims = {
            "sub": "test-user-sub",
            "iss": "https://cognito-idp.us-east-1.amazonaws.com/us-east-1_testCustomer",
            "client_id": "test-customer-client",
            "token_use": "access",
            "iat": now,
            "exp": now + 60,
            "scope": "openid",
        }
        claims.update(overrides)
        return jwt.encode(
            claims,
            private_key,
            algorithm="RS256",
            headers={"kid": "unit-test-key"},
        )

    return issue


def test_verify_token_accepts_signed_access_token_and_binds_client(signed_token):
    payload = cognito.verify_token(signed_token(), user_pool="customers")

    assert payload["sub"] == "test-user-sub"
    assert payload["token_use"] == "access"
    assert payload["client_id"] == "test-customer-client"


@pytest.mark.parametrize(
    "claims, detail",
    [
        ({"token_use": "id", "aud": "test-customer-client"}, "not an access token"),
        ({"client_id": "another-client"}, "wrong app client"),
        (
            {"iss": "https://cognito-idp.us-east-1.amazonaws.com/another-pool"},
            "Invalid or expired token",
        ),
        ({"exp": int(time.time()) - 1}, "Invalid or expired token"),
    ],
)
def test_verify_token_rejects_wrong_token_kind_client_issuer_and_expiry(
    signed_token, claims, detail
):
    with pytest.raises(HTTPException) as error:
        cognito.verify_token(signed_token(**claims), user_pool="customers")

    assert error.value.status_code == 401
    assert detail in error.value.detail


def test_verify_token_binds_to_the_selected_user_pool(signed_token):
    with pytest.raises(HTTPException, match="Invalid or expired token"):
        cognito.verify_token(signed_token(), user_pool="reviewers")
