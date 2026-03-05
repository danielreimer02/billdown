"""
Insurance Plans API — user-owned plan management & comparison.

URL patterns (user resolved from token or X-Guest-ID header):
  GET    /api/insurance-plans              my plans
  POST   /api/insurance-plans              add a plan
  GET    /api/insurance-plans/compare      compare all my plans (or ?ids=a,b,c)
  GET    /api/insurance-plans/:id          one plan I own
  PATCH  /api/insurance-plans/:id          update a plan
  DELETE /api/insurance-plans/:id          delete a plan
"""

from datetime import datetime
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.security import get_current_user, get_db
from app.models.models import InsurancePlan, User

GUEST_HEADER = "X-Guest-ID"

router = APIRouter()


# ── Helpers ──

def _get_guest_id(request: Request) -> Optional[str]:
    return request.headers.get(GUEST_HEADER)


def _owner_filter(query, current_user: Optional[User], request: Request):
    """Scope query to the caller's plans."""
    if current_user:
        return query.filter(InsurancePlan.user_id == current_user.id)
    guest_id = _get_guest_id(request)
    if guest_id:
        return query.filter(InsurancePlan.guest_id == guest_id, InsurancePlan.user_id.is_(None))
    return query.filter(False)  # no identity → nothing


def _check_plan_access(plan: InsurancePlan, current_user: Optional[User], request: Request):
    if current_user:
        if plan.user_id and plan.user_id != current_user.id:
            raise HTTPException(status_code=404, detail="Plan not found")
    else:
        guest_id = _get_guest_id(request)
        if not guest_id or plan.guest_id != guest_id:
            raise HTTPException(status_code=404, detail="Plan not found")


# ── Schemas ──

class PlanCreate(BaseModel):
    name: str
    carrier: Optional[str] = None
    plan_type: Optional[str] = None
    metal_tier: Optional[str] = None
    member_id: Optional[str] = None
    group_number: Optional[str] = None
    monthly_premium: float = 0.0
    annual_deductible: float = 0.0
    family_deductible: Optional[float] = None
    oop_max: float = 0.0
    family_oop_max: Optional[float] = None
    copay_primary: float = 0.0
    copay_specialist: float = 0.0
    copay_urgent_care: float = 0.0
    copay_er: float = 0.0
    coinsurance: float = 20.0
    rx_generic: float = 0.0
    rx_preferred: float = 0.0
    rx_specialty: Optional[float] = None
    hsa_eligible: bool = False
    telehealth_copay: Optional[float] = None
    mental_health_copay: Optional[float] = None
    employer_contribution: Optional[float] = None
    employee_cost: Optional[float] = None
    notes: Optional[str] = None


class PlanUpdate(BaseModel):
    name: Optional[str] = None
    carrier: Optional[str] = None
    plan_type: Optional[str] = None
    metal_tier: Optional[str] = None
    member_id: Optional[str] = None
    group_number: Optional[str] = None
    monthly_premium: Optional[float] = None
    annual_deductible: Optional[float] = None
    family_deductible: Optional[float] = None
    oop_max: Optional[float] = None
    family_oop_max: Optional[float] = None
    copay_primary: Optional[float] = None
    copay_specialist: Optional[float] = None
    copay_urgent_care: Optional[float] = None
    copay_er: Optional[float] = None
    coinsurance: Optional[float] = None
    rx_generic: Optional[float] = None
    rx_preferred: Optional[float] = None
    rx_specialty: Optional[float] = None
    hsa_eligible: Optional[bool] = None
    telehealth_copay: Optional[float] = None
    mental_health_copay: Optional[float] = None
    employer_contribution: Optional[float] = None
    employee_cost: Optional[float] = None
    notes: Optional[str] = None


class PlanResponse(BaseModel):
    id: str
    name: str
    carrier: Optional[str] = None
    plan_type: Optional[str] = None
    metal_tier: Optional[str] = None
    member_id: Optional[str] = None
    group_number: Optional[str] = None
    monthly_premium: float = 0.0
    annual_deductible: float = 0.0
    family_deductible: Optional[float] = None
    oop_max: float = 0.0
    family_oop_max: Optional[float] = None
    copay_primary: float = 0.0
    copay_specialist: float = 0.0
    copay_urgent_care: float = 0.0
    copay_er: float = 0.0
    coinsurance: float = 20.0
    rx_generic: float = 0.0
    rx_preferred: float = 0.0
    rx_specialty: Optional[float] = None
    hsa_eligible: bool = False
    telehealth_copay: Optional[float] = None
    mental_health_copay: Optional[float] = None
    employer_contribution: Optional[float] = None
    employee_cost: Optional[float] = None
    notes: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ── Routes ──

@router.get("/", response_model=list[PlanResponse])
def list_plans(
    request: Request,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user),
):
    """List the caller's insurance plans."""
    query = _owner_filter(db.query(InsurancePlan), current_user, request)
    return query.order_by(InsurancePlan.created_at.desc()).all()


@router.post("/", response_model=PlanResponse, status_code=status.HTTP_201_CREATED)
def create_plan(
    payload: PlanCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user),
):
    """Create a new insurance plan."""
    guest_id = _get_guest_id(request) if not current_user else None

    plan = InsurancePlan(
        user_id=current_user.id if current_user else None,
        guest_id=guest_id,
        **payload.model_dump(),
    )
    db.add(plan)
    db.commit()
    db.refresh(plan)
    return plan


@router.get("/compare", response_model=list[PlanResponse])
def compare_plans(
    request: Request,
    ids: Optional[str] = Query(None, description="Comma-separated plan IDs to compare"),
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user),
):
    """
    Compare plans.
    - /insurance-plans/compare           → all my plans
    - /insurance-plans/compare?ids=a,b   → specific plans (must own them)
    """
    query = _owner_filter(db.query(InsurancePlan), current_user, request)
    if ids:
        id_list = [i.strip() for i in ids.split(",") if i.strip()]
        query = query.filter(InsurancePlan.id.in_(id_list))
    return query.order_by(InsurancePlan.created_at.asc()).all()


@router.get("/{plan_id}", response_model=PlanResponse)
def get_plan(
    plan_id: str,
    request: Request,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user),
):
    plan = db.query(InsurancePlan).filter(InsurancePlan.id == plan_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    _check_plan_access(plan, current_user, request)
    return plan


@router.patch("/{plan_id}", response_model=PlanResponse)
def update_plan(
    plan_id: str,
    payload: PlanUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user),
):
    plan = db.query(InsurancePlan).filter(InsurancePlan.id == plan_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    _check_plan_access(plan, current_user, request)

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(plan, field, value)

    db.commit()
    db.refresh(plan)
    return plan


@router.delete("/{plan_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_plan(
    plan_id: str,
    request: Request,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user),
):
    plan = db.query(InsurancePlan).filter(InsurancePlan.id == plan_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    _check_plan_access(plan, current_user, request)
    db.delete(plan)
    db.commit()
