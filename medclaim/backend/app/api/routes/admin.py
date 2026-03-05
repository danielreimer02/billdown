"""
Admin API routes — elevated views of resources, admin-only.

URL patterns:
  /api/admin/cases                  all cases (no scope)
  /api/admin/cases?type=billing     filter by type
  /api/admin/users                  all users
  /api/admin/users/:id/cases        one user's cases

All endpoints require an authenticated user with role=admin.
"""

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.security import get_db, require_role
from app.models.models import Case, CaseType, CaseStatus, User, UserRole, AuditLog, AuditAction

router = APIRouter()

# Every endpoint in this router requires admin role
_admin = Depends(require_role("admin"))


# ── Schemas ──

class AdminCaseResponse(BaseModel):
    """Case response with owner info for admin views."""
    id: str
    case_type: CaseType
    status: CaseStatus
    state: Optional[str] = None
    locality: Optional[str] = None
    provider_name: Optional[str] = None
    total_billed: Optional[float] = None
    total_paid: Optional[float] = None
    balance_due: Optional[float] = None
    household_size: Optional[int] = None
    annual_income: Optional[float] = None
    savings_found: float = 0.0
    savings_achieved: float = 0.0
    created_at: Optional[datetime] = None
    # Owner info
    user_id: Optional[str] = None
    user_email: Optional[str] = None
    user_name: Optional[str] = None
    guest_id: Optional[str] = None
    owner_label: str = ""   # computed: email, "Guest abc123…", or "Unknown"

    class Config:
        from_attributes = True


def _to_admin_case(case: Case) -> dict:
    """Convert a Case ORM object into AdminCaseResponse-compatible dict."""
    owner_label = "Unknown"
    user_email = None
    user_name = None
    if case.user_id and case.user:
        user_email = case.user.email
        user_name = case.user.full_name
        owner_label = case.user.email
    elif case.guest_id:
        owner_label = f"Guest {case.guest_id[:8]}…"

    return {
        "id": case.id,
        "case_type": case.case_type,
        "status": case.status,
        "state": case.state,
        "locality": case.locality,
        "provider_name": case.provider_name,
        "total_billed": case.total_billed,
        "total_paid": case.total_paid,
        "balance_due": case.balance_due,
        "household_size": case.household_size,
        "annual_income": case.annual_income,
        "savings_found": case.savings_found or 0.0,
        "savings_achieved": case.savings_achieved or 0.0,
        "created_at": case.created_at,
        "user_id": case.user_id,
        "user_email": user_email,
        "user_name": user_name,
        "guest_id": case.guest_id,
        "owner_label": owner_label,
    }


# ── Cases ──

@router.get("/cases", response_model=list[AdminCaseResponse], dependencies=[_admin])
def admin_list_cases(
    type: Optional[CaseType] = Query(None, description="Filter by case type"),
    status: Optional[CaseStatus] = Query(None, description="Filter by status"),
    db: Session = Depends(get_db),
):
    """List ALL cases across all users and guests."""
    query = db.query(Case)
    if type:
        query = query.filter(Case.case_type == type)
    if status:
        query = query.filter(Case.status == status)
    cases = query.order_by(Case.created_at.desc()).all()
    return [_to_admin_case(c) for c in cases]


@router.get("/cases/{case_id}", response_model=AdminCaseResponse, dependencies=[_admin])
def admin_get_case(
    case_id: str,
    db: Session = Depends(get_db),
):
    """Get any case by ID (no ownership check)."""
    case = db.query(Case).filter(Case.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    return _to_admin_case(case)


# ── Users ──

from app.schemas.auth import UserOut


@router.get("/users", response_model=list[UserOut], dependencies=[_admin])
def admin_list_users(
    role: Optional[UserRole] = Query(None, description="Filter by role"),
    db: Session = Depends(get_db),
):
    """List all users."""
    query = db.query(User)
    if role:
        query = query.filter(User.role == role)
    return query.order_by(User.created_at.desc()).all()


@router.get("/users/{user_id}", response_model=UserOut, dependencies=[_admin])
def admin_get_user(
    user_id: str,
    db: Session = Depends(get_db),
):
    """Get a single user by ID."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.get("/users/{user_id}/cases", response_model=list[AdminCaseResponse], dependencies=[_admin])
def admin_user_cases(
    user_id: str,
    db: Session = Depends(get_db),
):
    """List all cases for a specific user."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    cases = (
        db.query(Case)
        .filter(Case.user_id == user_id)
        .order_by(Case.created_at.desc())
        .all()
    )
    return [_to_admin_case(c) for c in cases]


# ── Audit Logs ──

class AuditLogResponse(BaseModel):
    id: str
    user_id: Optional[str] = None
    user_email: Optional[str] = None
    guest_id: Optional[str] = None
    action: str
    resource_type: str
    resource_id: Optional[str] = None
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    endpoint: Optional[str] = None
    metadata_json: Optional[dict] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


@router.get("/audit-logs", response_model=list[AuditLogResponse], dependencies=[_admin])
def admin_list_audit_logs(
    action: Optional[str] = Query(None, description="Filter by action (view, create, update, delete, login, etc.)"),
    resource_type: Optional[str] = Query(None, description="Filter by resource type (case, document, insurance_plan, etc.)"),
    user_id: Optional[str] = Query(None, description="Filter by user ID"),
    limit: int = Query(100, ge=1, le=1000, description="Number of records to return"),
    offset: int = Query(0, ge=0, description="Offset for pagination"),
    db: Session = Depends(get_db),
):
    """List audit logs — most recent first. HIPAA-required audit trail."""
    query = db.query(AuditLog)
    if action:
        query = query.filter(AuditLog.action == action)
    if resource_type:
        query = query.filter(AuditLog.resource_type == resource_type)
    if user_id:
        query = query.filter(AuditLog.user_id == user_id)
    return (
        query.order_by(AuditLog.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )


@router.get("/audit-logs/stats", dependencies=[_admin])
def admin_audit_stats(
    db: Session = Depends(get_db),
):
    """Summary stats for the audit log dashboard."""
    from sqlalchemy import func

    total = db.query(func.count(AuditLog.id)).scalar()
    by_action = dict(
        db.query(AuditLog.action, func.count(AuditLog.id))
        .group_by(AuditLog.action)
        .all()
    )
    by_resource = dict(
        db.query(AuditLog.resource_type, func.count(AuditLog.id))
        .group_by(AuditLog.resource_type)
        .all()
    )
    unique_users = db.query(func.count(func.distinct(AuditLog.user_id))).scalar()

    return {
        "total_events": total,
        "by_action": by_action,
        "by_resource_type": by_resource,
        "unique_users": unique_users,
    }