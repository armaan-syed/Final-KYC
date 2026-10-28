"""S3 presigned URL generation for document upload and preview.

The backend never accepts an arbitrary bucket/key from the client.
All keys are server-derived to prevent path traversal and unauthorized access.
"""

import os
from urllib.parse import urlparse

import boto3
from botocore.exceptions import ClientError

from app.config import settings
from fastapi import HTTPException, status
from pramana_limits import MAX_DOCUMENT_BYTES, ALLOWED_DOCUMENT_CONTENT_TYPES

s3_client = boto3.client("s3", region_name=settings.aws_region)


def generate_presigned_upload_url(
    s3_key: str,
    content_type: str,
    expiry_seconds: int | None = None,
) -> str:
    """Generate a presigned PUT URL for uploading a document to S3.

    Args:
        s3_key: Server-derived S3 object key.
        content_type: MIME type of the object being uploaded.
        expiry_seconds: URL expiry in seconds (defaults to settings value).

    Returns:
        A presigned HTTPS URL for PUT upload.
    """
    expiry = expiry_seconds or settings.presigned_url_expiry_seconds
    try:
        url = s3_client.generate_presigned_url(
            ClientMethod="put_object",
            Params={
                "Bucket": settings.s3_documents_bucket,
                "Key": s3_key,
                "ContentType": content_type,
            },
            ExpiresIn=expiry,
            HttpMethod="PUT",
        )
    except ClientError as exc:  # pragma: no cover - AWS failure
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Unable to generate upload URL",
        ) from exc
    return url


def generate_presigned_get_url(
    s3_key: str,
    s3_bucket: str | None = None,
    expiry_seconds: int | None = None,
) -> str:
    """Generate a presigned GET URL for previewing a document from S3.

    Args:
        s3_key: S3 object key.
        s3_bucket: Bucket name (defaults to settings bucket).
        expiry_seconds: URL expiry in seconds.

    Returns:
        A presigned HTTPS URL for GET download/preview.
    """
    bucket = s3_bucket or settings.s3_documents_bucket
    expiry = expiry_seconds or settings.presigned_get_url_expiry_seconds
    try:
        url = s3_client.generate_presigned_url(
            ClientMethod="get_object",
            Params={"Bucket": bucket, "Key": s3_key},
            ExpiresIn=expiry,
            HttpMethod="GET",
        )
    except ClientError as exc:  # pragma: no cover - AWS failure
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Unable to generate document preview URL",
        ) from exc
    return url


def inspect_uploaded_document(s3_key: str, s3_bucket: str | None = None) -> dict[str, object]:
    """Read authoritative size/type metadata for an uploaded KYC object."""
    bucket = s3_bucket or settings.s3_documents_bucket
    try:
        metadata = s3_client.head_object(Bucket=bucket, Key=s3_key)
    except ClientError as exc:
        code = exc.response.get("Error", {}).get("Code", "")
        is_missing = code in {"404", "NoSuchKey", "NotFound"}
        raise HTTPException(
            status_code=(status.HTTP_400_BAD_REQUEST if is_missing else status.HTTP_503_SERVICE_UNAVAILABLE),
            detail=("Uploaded document was not found." if is_missing else "Unable to inspect uploaded document."),
        ) from exc

    content_length = int(metadata.get("ContentLength", -1))
    content_type = str(metadata.get("ContentType", "")).split(";", 1)[0].strip().lower()
    if content_length < 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded document size is invalid.",
        )
    if content_length > MAX_DOCUMENT_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Document must be no larger than 10 MiB.",
        )
    if content_type not in ALLOWED_DOCUMENT_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Document must be JPEG, PNG, or PDF.",
        )
    return {"content_length": content_length, "content_type": content_type}


def derive_s3_key(customer_id: str, attempt_id: str, file_name: str) -> str:
    """Derive a server-controlled S3 key for a document upload.

    The key includes customer_id and attempt_id so each attempt's document
    is isolated. The original file name is sanitized to prevent path traversal.

    Returns:
        A key like: documents/{customer_id}/{attempt_id}/{safe_file_name}
    """
    safe_name = os.path.basename(file_name)
    return f"documents/{customer_id}/{attempt_id}/{safe_name}"
