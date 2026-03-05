from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models.models import Case, CaseStatus, CaseType, User
from app.core.security import get_current_user
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
import uuid

GUEST_HEADER = "X-Guest-ID"

router = APIRouter()


def _get_guest_id(request: Request) -> Optional[str]:
    """Read guest ID from X-Guest-ID header."""
    return request.headers.get(GUEST_HEADER)


def _check_case_access(case: Case, current_user: Optional[User], request: Request):
    """Raise 404 if the caller doesn't own this case."""
    if current_user:
        # Authenticated — must own the case (or case is unclaimed)
        if case.user_id and case.user_id != current_user.id:
            raise HTTPException(status_code=404, detail="Case not found")
    else:
        # Guest — must match guest_id header
        guest_id = _get_guest_id(request)
        if not guest_id or case.guest_id != guest_id:
            raise HTTPException(status_code=404, detail="Case not found")


# ─────────────────────────────────────────
# SCHEMAS
# ─────────────────────────────────────────

class CaseCreate(BaseModel):
    case_type: CaseType = CaseType.BILLING
    state: Optional[str] = None
    locality: Optional[str] = None
    household_size: Optional[int] = None
    annual_income: Optional[float] = None
    provider_name: Optional[str] = None
    total_billed: Optional[float] = None
    total_paid: Optional[float] = None


class CaseUpdate(BaseModel):
    """Partial update — only fields that are set will be applied."""
    state: Optional[str] = None
    locality: Optional[str] = None
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
    state: Optional[str] = None
    locality: Optional[str] = None
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
    request: Request,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user),
):
    """Create a new case. Assigns to logged-in user if authenticated.
    For guests, X-Guest-ID header ties the case to this browser."""
    balance = None
    if payload.total_billed is not None and payload.total_paid is not None:
        balance = payload.total_billed - payload.total_paid

    guest_id = _get_guest_id(request) if not current_user else None

    case = Case(
        id=str(uuid.uuid4()),
        user_id=current_user.id if current_user else None,
        guest_id=guest_id,
        case_type=payload.case_type,
        state=payload.state or "",
        locality=payload.locality,
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
    request: Request,
    type: Optional[CaseType] = Query(None, description="Filter by case type"),
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user),
):
    """
    List cases.
    - Authenticated users see only their own cases.
    - Guests see only cases tied to their session cookie.
    - No session cookie → empty list.

    GET /api/cases/                     — user's or guest-session's cases
    GET /api/cases/?type=billing        — filter by type
    """
    query = db.query(Case)
    if current_user:
        query = query.filter(Case.user_id == current_user.id)
    else:
        guest_id = _get_guest_id(request)
        if guest_id:
            query = query.filter(Case.guest_id == guest_id, Case.user_id.is_(None))
        else:
            return []
    if type:
        query = query.filter(Case.case_type == type)
    return query.order_by(Case.created_at.desc()).all()


@router.get("/{case_id}", response_model=CaseResponse)
def get_case(
    case_id: str,
    request: Request,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user),
):
    case = db.query(Case).filter(Case.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    _check_case_access(case, current_user, request)
    return case


@router.patch("/{case_id}", response_model=CaseResponse)
def update_case(
    case_id: str,
    payload: CaseUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user),
):
    """
    Partial update — only set fields are applied.
    Recalculates balance_due if total_billed or total_paid change.
    """
    case = db.query(Case).filter(Case.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    _check_case_access(case, current_user, request)

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
    request: Request,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user),
):
    """Delete a case and all related records."""
    case = db.query(Case).filter(Case.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    _check_case_access(case, current_user, request)
    db.delete(case)
    db.commit()
