"""
Document upload + OCR + code confirmation routes.

Flow:
  1. POST /{case_id}/upload         - Save to S3, return instantly, OCR in background
  2. GET  /{case_id}/documents      - List docs + OCR status
  3. GET  /{case_id}/documents/{doc_id}/view - Serve file from S3
  4. GET  /{case_id}/extracted-codes - Auto-extracted codes for user review
  5. POST /{case_id}/confirm-codes  - User confirms codes, triggers analysis
  6. GET  /{case_id}/analysis       - Analysis results
"""

import logging
import mimetypes
import uuid
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import get_db
from app.models.models import (
    Case,
    CaseStatus,
    Document,
    DocumentType,
    LineItem,
)
from app.services.billing_service import BillLine, analyze_bill
from app.services.document_processor import process_document
from app.services.storage import upload_file

logger = logging.getLogger(__name__)

router = APIRouter()


# -----------------------------------------------------------------
# BACKGROUND: OCR + Code Extraction
# -----------------------------------------------------------------

def _run_ocr_background(
    document_id: str,
    case_id: str,
    file_bytes: bytes,
    filename: str,
):
    """
    BackgroundTask: Run OCR, extract codes, create LineItems.
    Runs after the upload response is already sent to the user.

    NOTE: Uses raw UPDATE statements to avoid SQLAlchemy relationship
    side-effects that can null out case_id when both Case and Document
    are loaded in the same session.
    """
    from sqlalchemy import update as sa_update

    from app.db.session import SessionLocal

    db = SessionLocal()
    try:
        # Mark case as processing (raw UPDATE — no ORM object loading)
        db.execute(
            sa_update(Case)
            .where(Case.id == case_id)
            .values(status=CaseStatus.OCR_PROCESSING)
        )
        db.commit()

        logger.info(f"Starting OCR for document {document_id} ({filename})")
        result = process_document(file_bytes, filename)

        # Update document with OCR results (raw UPDATE — avoids case_id being nulled)
        db.execute(
            sa_update(Document)
            .where(Document.id == document_id)
            .values(
                raw_text=result.raw_text,
                is_native_pdf=result.is_native_pdf,
                ocr_completed=True,
            )
        )
        db.commit()

        # Create line items — prefer paired data (CPT + amount from same table row)
        if result.code_amount_pairs:
            for pair in result.code_amount_pairs:
                line = LineItem(
                    id=str(uuid.uuid4()),
                    case_id=case_id,
                    document_id=document_id,
                    cpt_code=pair.cpt_code,
                    cpt_description=pair.description or None,
                    icd10_codes=result.icd10_codes,
                    units=1,
                    amount_billed=pair.amount,
                    user_confirmed=False,
                )
                db.add(line)
        else:
            # Fallback: unpaired CPTs (no table structure found)
            for cpt in result.cpt_codes:
                line = LineItem(
                    id=str(uuid.uuid4()),
                    case_id=case_id,
                    document_id=document_id,
                    cpt_code=cpt,
                    icd10_codes=result.icd10_codes,
                    units=1,
                    amount_billed=None,
                    user_confirmed=False,
                )
                db.add(line)

        db.commit()

        # Mark case as needing review
        db.execute(
            sa_update(Case)
            .where(Case.id == case_id)
            .values(status=CaseStatus.NEEDS_REVIEW)
        )
        db.commit()

        logger.info(
            f"OCR complete for {document_id}: "
            f"{len(result.cpt_codes)} CPTs, "
            f"{len(result.icd10_codes)} ICD-10s"
        )

    except Exception as e:
        logger.error(f"OCR background task failed for {document_id}: {e}")
        import traceback
        logger.error(traceback.format_exc())
        try:
            db.execute(
                sa_update(Case)
                .where(Case.id == case_id)
                .values(status=CaseStatus.NEEDS_REVIEW)
            )
            db.commit()
        except Exception:
            pass
    finally:
        db.close()


# -----------------------------------------------------------------
# BACKGROUND: Analysis Pipeline
# -----------------------------------------------------------------

def _run_analysis_background(case_id: str):
    """
    BackgroundTask: Run billing analysis on confirmed LineItems.
    Called ONLY after user confirms codes via confirm-codes endpoint.
    """
    from app.db.session import SessionLocal

    db = SessionLocal()
    try:
        case = db.query(Case).filter(Case.id == case_id).first()
        if not case:
            return

        case.status = CaseStatus.ANALYZING
        db.commit()

        line_items = (
            db.query(LineItem)
            .filter(
                LineItem.case_id == case_id,
                LineItem.user_confirmed == True,
            )
            .all()
        )

        if not line_items:
            case.status = CaseStatus.ANALYZED
            db.commit()
            return

        bill_lines = [
            BillLine(
                cpt_code=li.cpt_code,
                units=li.units or 1,
                charge=li.amount_billed or 0.0,
            )
            for li in line_items
        ]

        setting = "hospital"
        result = analyze_bill(
            lines=bill_lines,
            state=case.state or "",
            setting=setting,
        )

        # Build a map of CPT → bundling flags for BOTH codes in each pair
        # cpt2 is the component (included) code, cpt1 is the comprehensive code
        bundling_map: dict[str, list[dict]] = {}
        for f in result.bundling_flags:
            # Flag for cpt2 (component): "27447 includes 27446"
            bundling_map.setdefault(f.cpt2, []).append({
                "type": "bundling",
                "detail": f.detail,
                "cpt1": f.cpt1,
                "modifierInd": f.modifier_ind,
            })
            # Flag for cpt1 (comprehensive): "27447 includes 27446"
            bundling_map.setdefault(f.cpt1, []).append({
                "type": "bundling",
                "detail": f.detail,
                "cpt1": f.cpt1,
                "modifierInd": f.modifier_ind,
            })

        mue_cpt_map = {f.cpt_code: f for f in result.mue_flags}
        price_cpt_map = {f.cpt_code: f for f in result.price_flags}

        for li in line_items:
            flags = []

            bundling_flags_for_cpt = bundling_map.get(li.cpt_code, [])
            if bundling_flags_for_cpt:
                li.ncci_violation = True
                flags.extend(bundling_flags_for_cpt)

            mue_flag = mue_cpt_map.get(li.cpt_code)
            if mue_flag:
                li.mue_violation = True
                flags.append({
                    "type": "mue",
                    "detail": mue_flag.detail,
                    "maxUnits": mue_flag.max_units,
                    "mai": mue_flag.mai,
                })

            price_flag = price_cpt_map.get(li.cpt_code)
            if price_flag:
                li.medicare_rate = price_flag.medicare_rate
                flags.append({
                    "type": "price",
                    "detail": price_flag.detail,
                    "medicareRate": price_flag.medicare_rate,
                    "ratio": price_flag.ratio,
                })

            li.flags = flags if flags else None

        case.savings_found = result.total_overcharge_estimate
        case.status = CaseStatus.ANALYZED
        db.commit()

        logger.info(
            f"Analysis complete for case {case_id}: "
            f"{len(result.bundling_flags)} bundling, "
            f"{len(result.mue_flags)} MUE, "
            f"{len(result.price_flags)} price flags. "
            f"Est. overcharge: ${result.total_overcharge_estimate:,.2f}"
        )

    except Exception as e:
        logger.error(f"Analysis background task failed for case {case_id}: {e}")
        try:
            case = db.query(Case).filter(Case.id == case_id).first()
            if case:
                case.status = CaseStatus.ANALYZED
                db.commit()
        except Exception:
            pass
    finally:
        db.close()


# -----------------------------------------------------------------
# ROUTES
# -----------------------------------------------------------------

@router.post("/{case_id}/documents/upload")
async def upload_document(
    case_id: str,
    document_type: DocumentType,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """
    Upload a document to a case.

    1. Validate file type
    2. Upload to S3 immediately
    3. Create Document record (ocr_completed=false)
    4. Return document_id instantly
    5. BackgroundTask: OCR -> extract codes -> create LineItems -> needs_review
    """
    allowed_types = ["application/pdf", "image/jpeg", "image/png"]
    if file.content_type not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail=f"File type {file.content_type} not supported. Use PDF, JPG, or PNG.",
        )

    case = db.query(Case).filter(Case.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    file_bytes = await file.read()
    doc_id = str(uuid.uuid4())
    storage_path = f"cases/{case_id}/documents/{doc_id}/{file.filename}"

    upload_file(
        file_bytes=file_bytes,
        key=storage_path,
        content_type=file.content_type or "application/octet-stream",
    )

    doc = Document(
        id=doc_id,
        case_id=case_id,
        document_type=document_type,
        file_name=file.filename,
        storage_path=storage_path,
        ocr_completed=False,
    )
    db.add(doc)

    case.status = CaseStatus.UPLOADED
    db.commit()

    background_tasks.add_task(
        _run_ocr_background,
        document_id=doc_id,
        case_id=case_id,
        file_bytes=file_bytes,
        filename=file.filename or "upload.pdf",
    )

    return {
        "documentId": doc_id,
        "status": "uploaded",
        "message": "Document uploaded. OCR processing will begin shortly.",
    }


@router.get("/{case_id}/documents")
def list_documents(case_id: str, db: Session = Depends(get_db)):
    """List all documents for a case with OCR status."""
    docs = db.query(Document).filter(Document.case_id == case_id).all()
    return [
        {
            "id": d.id,
            "fileName": d.file_name,
            "documentType": d.document_type,
            "ocrCompleted": d.ocr_completed,
            "isNativePdf": d.is_native_pdf,
            "createdAt": d.created_at,
            "viewUrl": f"/api/cases/{case_id}/documents/{d.id}/view",
        }
        for d in docs
    ]


@router.get("/{case_id}/documents/{document_id}/view")
def view_document(case_id: str, document_id: str, db: Session = Depends(get_db)):
    """Serve a document file from S3 for viewing in the browser."""
    from app.services.storage import get_file

    doc = db.query(Document).filter(
        Document.id == document_id,
        Document.case_id == case_id,
    ).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    try:
        file_bytes = get_file(doc.storage_path)
    except Exception as e:
        logger.error(f"Failed to retrieve document {document_id} from S3: {e}")
        raise HTTPException(status_code=404, detail="File not found in storage")

    # Guess content type from filename
    content_type, _ = mimetypes.guess_type(doc.file_name or "file")
    if not content_type:
        content_type = "application/octet-stream"

    return Response(
        content=file_bytes,
        media_type=content_type,
        headers={
            "Content-Disposition": f'inline; filename="{doc.file_name}"',
        },
    )


@router.delete("/{case_id}/documents/{document_id}")
def delete_document(case_id: str, document_id: str, db: Session = Depends(get_db)):
    """Delete a document: remove from DB (+ associated line items) and S3."""
    from app.services.storage import delete_file

    doc = db.query(Document).filter(
        Document.id == document_id,
        Document.case_id == case_id,
    ).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    # Delete associated line items
    db.query(LineItem).filter(LineItem.document_id == document_id).delete()

    # Delete from S3 (best-effort)
    if doc.storage_path:
        try:
            delete_file(doc.storage_path)
        except Exception as e:
            logger.warning(f"Failed to delete S3 object for doc {document_id}: {e}")

    db.delete(doc)
    db.commit()

    return {"status": "deleted", "documentId": document_id}


@router.get("/{case_id}/extracted-codes")
def get_extracted_codes(case_id: str, db: Session = Depends(get_db)):
    """
    Auto-extracted codes for user review.
    Frontend shows these as editable fields. User confirms before analysis.
    """
    line_items = db.query(LineItem).filter(LineItem.case_id == case_id).all()
    return {
        "caseId": case_id,
        "lineItems": [
            {
                "id": li.id,
                "cptCode": li.cpt_code,
                "icd10Codes": li.icd10_codes or [],
                "units": li.units,
                "amountBilled": li.amount_billed,
                "userConfirmed": li.user_confirmed,
            }
            for li in line_items
        ],
    }


class ConfirmLineItem(BaseModel):
    id: Optional[str] = None
    cptCode: str
    icd10Codes: list[str] = []
    units: int = 1
    amountBilled: Optional[float] = None


class ConfirmCodesRequest(BaseModel):
    lineItems: list[ConfirmLineItem]


@router.post("/{case_id}/confirm-codes")
async def confirm_codes(
    case_id: str,
    req: ConfirmCodesRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """
    User confirms (and optionally edits) extracted codes.

    THE GATE -- analysis only runs after this endpoint is called.
    Frontend sends the corrected list of line items.
    """
    case = db.query(Case).filter(Case.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    # Delete ALL existing line items for this case — we'll recreate from the
    # user's confirmed list. The old approach tried to update by ID, but
    # those items were already deleted as unconfirmed.
    db.query(LineItem).filter(LineItem.case_id == case_id).delete()

    for item in req.lineItems:
        li = LineItem(
            id=str(uuid.uuid4()),
            case_id=case_id,
            cpt_code=item.cptCode,
            icd10_codes=item.icd10Codes,
            units=item.units,
            amount_billed=item.amountBilled,
            user_confirmed=True,
        )
        db.add(li)

    db.commit()

    background_tasks.add_task(_run_analysis_background, case_id)

    return {
        "status": "analyzing",
        "message": "Codes confirmed. Analysis is running.",
    }


@router.get("/{case_id}/analysis")
def get_analysis_results(case_id: str, db: Session = Depends(get_db)):
    """Analysis results for a case: confirmed line items with flags."""
    case = db.query(Case).filter(Case.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    line_items = (
        db.query(LineItem)
        .filter(
            LineItem.case_id == case_id,
            LineItem.user_confirmed == True,
        )
        .all()
    )

    return {
        "caseId": case_id,
        "status": case.status.value if case.status else None,
        "savingsFound": case.savings_found,
        "lineItems": [
            {
                "id": li.id,
                "cptCode": li.cpt_code,
                "units": li.units,
                "amountBilled": li.amount_billed,
                "medicareRate": li.medicare_rate,
                "ncciViolation": li.ncci_violation,
                "mueViolation": li.mue_violation,
                "flags": li.flags or [],
            }
            for li in line_items
        ],
    }
