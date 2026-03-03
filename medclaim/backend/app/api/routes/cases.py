from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models.models import Case, CaseStatus
from pydantic import BaseModel
from typing import Optional
import uuid

router = APIRouter()


class CaseCreate(BaseModel):
    state: str
    household_size: Optional[int] = None
    annual_income: Optional[float] = None
    provider_name: Optional[str] = None
    total_billed: Optional[float] = None
    total_paid: Optional[float] = None


class CaseResponse(BaseModel):
    id: str
    status: CaseStatus
    state: str
    provider_name: Optional[str]
    total_billed: Optional[float]
    total_paid: Optional[float]
    balance_due: Optional[float]
    savings_found: float
    savings_achieved: float

    class Config:
        from_attributes = True


@router.post("/", response_model=CaseResponse, status_code=status.HTTP_201_CREATED)
def create_case(
    payload: CaseCreate,
    db: Session = Depends(get_db),
    # TODO: add current_user: User = Depends(get_current_user)
):
    """
    Create a new billing dispute case.
    This is the entry point — user starts here before uploading documents.
    """
    balance = None
    if payload.total_billed is not None and payload.total_paid is not None:
        balance = payload.total_billed - payload.total_paid

    case = Case(
        id=str(uuid.uuid4()),
        user_id="temp-user-id",  # TODO: from auth
        state=payload.state,
        household_size=payload.household_size,
        annual_income=payload.annual_income,
        provider_name=payload.provider_name,
        total_billed=payload.total_billed,
        total_paid=payload.total_paid,
        balance_due=balance,
        status=CaseStatus.PENDING,
    )
    db.add(case)
    db.commit()
    db.refresh(case)
    return case


@router.get("/{case_id}", response_model=CaseResponse)
def get_case(case_id: str, db: Session = Depends(get_db)):
    case = db.query(Case).filter(Case.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    return case


@router.get("/", response_model=list[CaseResponse])
def list_cases(db: Session = Depends(get_db)):
    # TODO: filter by current_user
    return db.query(Case).all()
