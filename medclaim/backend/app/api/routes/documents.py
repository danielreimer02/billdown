from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models.models import Document, DocumentType
import uuid
import boto3
from app.core.config import settings

router = APIRouter()


def _get_s3_client():
    """Get S3 client — uses LocalStack in dev, real AWS in prod."""
    kwargs = {
        "aws_access_key_id": settings.AWS_ACCESS_KEY_ID,
        "aws_secret_access_key": settings.AWS_SECRET_ACCESS_KEY,
        "region_name": settings.AWS_REGION,
    }
    if settings.S3_ENDPOINT_URL:
        kwargs["endpoint_url"] = settings.S3_ENDPOINT_URL
    return boto3.client("s3", **kwargs)


@router.post("/{case_id}/upload")
async def upload_document(
    case_id: str,
    document_type: DocumentType,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """
    Upload a document (bill, EOB, denial letter) to a case.

    Flow:
    1. Validate file type
    2. Upload to S3 (LocalStack in dev)
    3. Create Document record in DB
    4. Return immediately
    """
    # Validate file type
    allowed_types = ["application/pdf", "image/jpeg", "image/png"]
    if file.content_type not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail=f"File type {file.content_type} not supported. Use PDF, JPG, or PNG."
        )

    file_bytes = await file.read()
    doc_id = str(uuid.uuid4())
    storage_path = f"cases/{case_id}/documents/{doc_id}/{file.filename}"

    # Upload to S3
    s3 = _get_s3_client()

    # Ensure bucket exists (LocalStack auto-create)
    try:
        s3.head_bucket(Bucket=settings.AWS_S3_BUCKET)
    except Exception:
        s3.create_bucket(Bucket=settings.AWS_S3_BUCKET)

    s3.put_object(
        Bucket=settings.AWS_S3_BUCKET,
        Key=storage_path,
        Body=file_bytes,
        ContentType=file.content_type,
    )

    # Create document record
    doc = Document(
        id=doc_id,
        case_id=case_id,
        document_type=document_type,
        file_name=file.filename,
        storage_path=storage_path,
        ocr_completed=False,
    )
    db.add(doc)
    db.commit()

    return {
        "document_id": doc_id,
        "status": "uploaded",
        "message": "Document uploaded successfully."
    }


@router.get("/{case_id}/documents")
def list_documents(case_id: str, db: Session = Depends(get_db)):
    docs = db.query(Document).filter(Document.case_id == case_id).all()
    return docs
