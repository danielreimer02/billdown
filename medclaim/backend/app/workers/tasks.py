"""
Celery worker for async tasks.

Why async for document processing:
- Textract takes 5-30 seconds
- pdfplumber on large PDFs can take 2-5 seconds
- Don't make the user wait with a frozen UI
- Queue the job, return immediately, notify when done
"""

from celery import Celery
from app.core.config import settings

celery_app = Celery(
    "medclaim",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    # Retry failed tasks up to 3 times
    task_max_retries=3,
    task_default_retry_delay=60,
)


@celery_app.task(bind=True, max_retries=3)
def process_document_task(self, document_id: str):
    """
    Process an uploaded document asynchronously.

    Flow:
    1. Load document bytes from storage
    2. Run through document_processor (pdf or textract)
    3. Extract CPT/ICD codes
    4. Run NCCI/MUE analysis
    5. Fetch Medicare rates for each CPT
    6. Save results to database
    7. Update case status
    """
    try:
        from app.db.session import SessionLocal
        from app.models.models import Document, LineItem, CaseStatus
        from app.services.document_processor import process_document
        from app.services.ncci_service import analyze_bill
        import boto3

        db = SessionLocal()

        # Load document
        doc = db.query(Document).filter(Document.id == document_id).first()
        if not doc:
            return {"error": "document not found"}

        # Get file from storage (Digital Ocean Spaces / S3 compatible)
        s3 = boto3.client(
            "s3",
            endpoint_url="https://nyc3.digitaloceanspaces.com",
            aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
            aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
        )
        response = s3.get_object(
            Bucket=settings.AWS_S3_BUCKET,
            Key=doc.storage_path
        )
        file_bytes = response["Body"].read()

        # Extract text and codes
        extracted = process_document(file_bytes, doc.file_name)

        # Save raw text back to document
        doc.raw_text = extracted.raw_text
        doc.is_native_pdf = extracted.is_native_pdf
        doc.ocr_completed = True
        db.commit()

        # Create line items for each CPT code found
        line_items_data = []
        for cpt in extracted.cpt_codes:
            line_item = LineItem(
                case_id=doc.case_id,
                document_id=doc.id,
                cpt_code=cpt,
                icd10_codes=extracted.icd10_codes,
                units=1,
            )
            db.add(line_item)
            line_items_data.append({"cpt_code": cpt, "units": 1})

        db.commit()

        # Run NCCI/MUE analysis
        analysis = analyze_bill(extracted.cpt_codes, line_items_data)

        return {
            "document_id": document_id,
            "cpt_codes_found": extracted.cpt_codes,
            "icd10_codes_found": extracted.icd10_codes,
            "analysis": analysis,
        }

    except Exception as exc:
        raise self.retry(exc=exc, countdown=60)

    finally:
        db.close()
