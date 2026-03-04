from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models.models import Case, CaseStatus, CaseType
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
import uuid

router = APIRouter()


# ─────────────────────────────────────────
# SCHEMAS
# ─────────────────────────────────────────

class CaseCreate(BaseModel):
    case_type: CaseType = CaseType.BILLING
    state: str
    household_size: Optional[int] = None
    annual_income: Optional[float] = None
    provider_name: Optional[str] = None
    total_billed: Optional[float] = None
    total_paid: Optional[float] = None


class CaseUpdate(BaseModel):
    """Partial update — only fields that are set will be applied."""
    state: Optional[str] = None
    household_size: Optional[int] = None
    annual_income: Optional[float] = None
    provider_name: Optional[str] = None
    total_billed: Optional[float] = None
    total_paid: Optional[float] = None
    notes: Optional[str] = None


class CaseResponse(BaseModel):
    id: str
    case_type: CaseType
    status: CaseStatus
    state: str
    provider_name: Optional[str]
    total_billed: Optional[float]
    total_paid: Optional[float]
    balance_due: Optional[float]
    household_size: Optional[int]
    annual_income: Optional[float]
    savings_found: float
    savings_achieved: float
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ─────────────────────────────────────────
# ROUTES
# ─────────────────────────────────────────

@router.post("/", response_model=CaseResponse, status_code=status.HTTP_201_CREATED)
def create_case(
    payload: CaseCreate,
    db: Session = Depends(get_db),
    # TODO: add current_user: User = Depends(get_current_user)
):
    """Create a new case. Defaults to billing type."""
    balance = None
    if payload.total_billed is not None and payload.total_paid is not None:
        balance = payload.total_billed - payload.total_paid

    case = Case(
        id=str(uuid.uuid4()),
        user_id=None,  # TODO: from auth — nullable until login is wired
        case_type=payload.case_type,
        state=payload.state,
        household_size=payload.household_size,
        annual_income=payload.annual_income,
        provider_name=payload.provider_name,
        total_billed=payload.total_billed,
        total_paid=payload.total_paid,
        balance_due=balance,
        status=CaseStatus.UPLOADED,
    )
    db.add(case)
    db.commit()
    db.refresh(case)
    return case


@router.get("/", response_model=list[CaseResponse])
def list_cases(
    type: Optional[CaseType] = Query(None, description="Filter by case type"),
    db: Session = Depends(get_db),
    # TODO: add current_user: User = Depends(get_current_user)
):
    """
    List cases. Optionally filter by type.

    GET /api/cases/              — all cases
    GET /api/cases/?type=billing — only billing cases
    """
    query = db.query(Case)
    if type:
        query = query.filter(Case.case_type == type)
    # TODO: filter by current_user when auth is wired
    return query.order_by(Case.created_at.desc()).all()


@router.get("/{case_id}", response_model=CaseResponse)
def get_case(case_id: str, db: Session = Depends(get_db)):
    case = db.query(Case).filter(Case.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    return case


@router.patch("/{case_id}", response_model=CaseResponse)
def update_case(
    case_id: str,
    payload: CaseUpdate,
    db: Session = Depends(get_db),
    # TODO: add current_user: User = Depends(get_current_user)
):
    """
    Partial update — only set fields are applied.
    Recalculates balance_due if total_billed or total_paid change.
    """
    case = db.query(Case).filter(Case.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(case, field, value)

    # Recalculate balance if either billing field changed
    if "total_billed" in update_data or "total_paid" in update_data:
        billed = case.total_billed
        paid = case.total_paid
        case.balance_due = (billed - paid) if (billed is not None and paid is not None) else None

    db.commit()
    db.refresh(case)
    return case


@router.delete("/{case_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_case(
    case_id: str,
    db: Session = Depends(get_db),
    # TODO: add current_user: User = Depends(get_current_user)
):
    """Delete a case and all related records."""
    case = db.query(Case).filter(Case.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    db.delete(case)
    db.commit()
