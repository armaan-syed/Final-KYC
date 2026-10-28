"""Cognito JWT validation and identity extraction.

Validates Cognito user pool access tokens using the JWKS endpoint.
Supports separate customer and reviewer pools with distinct app clients.
"""

import time
from typing import Any

import requests
from jose import jwt, JWTError
from app.config import settings
from fastapi import HTTPException, status

# In-memory JWKS cache: {pool_id: {"keys": [...], "expires_at": float}}
_jwks_cache: dict[str, dict[str, Any]] = {}
JWKS_CACHE_TTL_SECONDS = 3600


def _get_pool_config(user_pool: str) -> tuple[str, str]:
    """Return (pool_id, app_client_id) for the given pool type."""
    if user_pool == "customers":
        return settings.cognito_customer_pool_id, settings.cognito_app_client_id
    if user_pool == "reviewers":
        return settings.cognito_reviewer_pool_id, settings.cognito_reviewer_app_client_id
    raise ValueError(f"Unknown user pool: {user_pool}")


def _fetch_jwks(pool_id: str, region: str) -> dict[str, Any]:
    """Fetch JWKS from Cognito with caching."""
    now = time.time()
    cached = _jwks_cache.get(pool_id)
    if cached and now < cached["expires_at"]:
        return cached["keys"]

    url = f"https://cognito-idp.{region}.amazonaws.com/{pool_id}/.well-known/jwks.json"
    try:
        response = requests.get(url, timeout=10)
        response.raise_for_status()
        jwks = response.json()
    except Exception as exc:  # pragma: no cover - network failure
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Unable to verify token: authentication service unavailable",
        ) from exc

    _jwks_cache[pool_id] = {"keys": jwks, "expires_at": now + JWKS_CACHE_TTL_SECONDS}
    return jwks


def _find_key(jwks: dict[str, Any], kid: str) -> dict[str, Any] | None:
    """Find a JWK by kid."""
    for key in jwks.get("keys", []):
        if key.get("kid") == kid:
            return key
    return None


def verify_token(token: str, user_pool: str) -> dict[str, Any]:
    """Verify a Cognito access token and return its payload.

    Args:
        token: The Cognito access token string.
        user_pool: Either "customers" or "reviewers".

    Returns:
        The decoded JWT payload dict.

    Raises:
        HTTPException: If the token is invalid, expired, or belongs to the wrong pool/client.
    """
    pool_id, app_client_id = _get_pool_config(user_pool)

    try:
        unverified_header = jwt.get_unverified_header(token)
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
        ) from exc

    kid = unverified_header.get("kid")
    if not kid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token: missing key ID",
        )

    jwks = _fetch_jwks(pool_id, settings.aws_region)
    key = _find_key(jwks, kid)
    if key is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token: signing key not found",
        )

    # Construct the public key from JWK
    from jose import jwk

    public_key = jwk.construct(key)

    try:
        payload = jwt.decode(
            token,
            public_key,
            algorithms=["RS256"],
            issuer=f"https://cognito-idp.{settings.aws_region}.amazonaws.com/{pool_id}",
            options={"verify_exp": True, "verify_aud": False, "verify_iss": True},
        )
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        ) from exc

    # Cognito access tokens use client_id; ID tokens use aud. The frontend
    # sends access tokens to FastAPI, so reject ID tokens and bind the token
    # to the expected app client for this pool explicitly.
    if payload.get("token_use") != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token: not an access token",
        )
    if payload.get("client_id") != app_client_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token: wrong app client",
        )

    return payload
