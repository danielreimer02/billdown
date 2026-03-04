"""
S3 storage service.

Wraps boto3 for document upload/download/presigning.
Uses LocalStack in dev (S3_ENDPOINT_URL), real AWS/DO Spaces in prod.
"""

import logging
import boto3
from botocore.config import Config as BotoConfig

from app.core.config import settings

logger = logging.getLogger(__name__)

_client = None


def _get_client():
    """Lazy-init S3 client. Reused across requests."""
    global _client
    if _client is None:
        kwargs = {
            "service_name": "s3",
            "region_name": settings.AWS_REGION,
            "aws_access_key_id": settings.AWS_ACCESS_KEY_ID,
            "aws_secret_access_key": settings.AWS_SECRET_ACCESS_KEY,
            "config": BotoConfig(signature_version="s3v4"),
        }
        if settings.S3_ENDPOINT_URL:
            kwargs["endpoint_url"] = settings.S3_ENDPOINT_URL
        _client = boto3.client(**kwargs)
        # Ensure bucket exists (idempotent for LocalStack)
        _ensure_bucket()
    return _client


def _ensure_bucket():
    """Create the S3 bucket if it doesn't exist (dev/LocalStack)."""
    try:
        _client.head_bucket(Bucket=settings.AWS_S3_BUCKET)
    except Exception:
        try:
            _client.create_bucket(Bucket=settings.AWS_S3_BUCKET)
            logger.info(f"Created S3 bucket: {settings.AWS_S3_BUCKET}")
        except Exception as e:
            logger.warning(f"Could not create bucket: {e}")


def upload_file(file_bytes: bytes, key: str, content_type: str = "application/octet-stream") -> str:
    """
    Upload bytes to S3.

    Args:
        file_bytes: Raw file content.
        key: S3 object key, e.g. "cases/{case_id}/documents/{doc_id}/bill.pdf"
        content_type: MIME type.

    Returns:
        The S3 key (same as input).
    """
    client = _get_client()
    client.put_object(
        Bucket=settings.AWS_S3_BUCKET,
        Key=key,
        Body=file_bytes,
        ContentType=content_type,
    )
    logger.info(f"Uploaded {key} ({len(file_bytes)} bytes)")
    return key


def get_file(key: str) -> bytes:
    """
    Download an object from S3.

    Args:
        key: S3 object key.

    Returns:
        Raw file bytes.
    """
    client = _get_client()
    response = client.get_object(Bucket=settings.AWS_S3_BUCKET, Key=key)
    return response["Body"].read()


def delete_file(key: str) -> None:
    """
    Delete an object from S3.

    Args:
        key: S3 object key.
    """
    client = _get_client()
    client.delete_object(Bucket=settings.AWS_S3_BUCKET, Key=key)
    logger.info(f"Deleted {key} from S3")


def get_presigned_url(key: str, expires_in: int = 3600) -> str:
    """
    Generate a presigned URL for downloading an object.

    Args:
        key: S3 object key.
        expires_in: URL expiry in seconds (default 1 hour).

    Returns:
        Presigned URL string.
    """
    client = _get_client()
    url = client.generate_presigned_url(
        "get_object",
        Params={"Bucket": settings.AWS_S3_BUCKET, "Key": key},
        ExpiresIn=expires_in,
    )
    return url
