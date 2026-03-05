"""
HIPAA Audit Logging — core service.

Every access to PHI (Protected Health Information) must be logged.
This module provides:
  - log_action()   — call from any route to record an audit event
  - AuditMiddleware — auto-logs every API request at the HTTP layer

Audit logs are immutable — there is no update or delete endpoint.
Retention: keep forever (or minimum 6 years per HIPAA §164.530(j)).
"""

import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import Request
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.models import AuditLog, AuditAction, User

logger = logging.getLogger(__name__)


def log_action(
    *,
    db: Session,
    action: AuditAction,
    resource_type: str,
    resource_id: Optional[str] = None,
    user: Optional[User] = None,
    guest_id: Optional[str] = None,
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None,
    endpoint: Optional[str] = None,
    metadata: Optional[dict] = None,
) -> AuditLog:
    """Record a single audit event. Call this from route handlers.
    
    Usage:
        log_action(
            db=db,
            action=AuditAction.VIEW,
            resource_type="case",
            resource_id=case.id,
            user=current_user,
            ip_address=request.client.host,
            user_agent=request.headers.get("user-agent"),
            endpoint=f"GET /api/cases/{case.id}",
        )
    """
    entry = AuditLog(
        user_id=user.id if user else None,
        user_email=user.email if user else None,
        guest_id=guest_id,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        ip_address=ip_address,
        user_agent=user_agent[:500] if user_agent else None,
        endpoint=endpoint,
        metadata_json=metadata,
    )
    db.add(entry)
    db.commit()
    return entry


def log_from_request(
    *,
    request: Request,
    db: Session,
    action: AuditAction,
    resource_type: str,
    resource_id: Optional[str] = None,
    user: Optional[User] = None,
    guest_id: Optional[str] = None,
    metadata: Optional[dict] = None,
) -> AuditLog:
    """Convenience wrapper that extracts IP, user-agent, endpoint from the request."""
    ip = request.client.host if request.client else None
    ua = request.headers.get("user-agent")
    endpoint = f"{request.method} {request.url.path}"

    return log_action(
        db=db,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        user=user,
        guest_id=guest_id,
        ip_address=ip,
        user_agent=ua,
        endpoint=endpoint,
        metadata=metadata,
    )


# ── PHI resource types that trigger automatic audit logging ──
PHI_RESOURCE_PREFIXES = {
    "/api/cases":           "case",
    "/api/insurance-plans": "insurance_plan",
    "/api/admin":           "admin",
}

# Methods that map to audit actions
METHOD_ACTION_MAP = {
    "GET":    AuditAction.VIEW,
    "POST":   AuditAction.CREATE,
    "PUT":    AuditAction.UPDATE,
    "PATCH":  AuditAction.UPDATE,
    "DELETE": AuditAction.DELETE,
}


async def audit_middleware(request: Request, call_next):
    """Starlette middleware that auto-logs PHI access at the HTTP layer.
    
    This is a safety net — routes should ALSO call log_action() explicitly
    for fine-grained resource-level logging. The middleware catches anything
    that slips through.
    """
    response = await call_next(request)

    # Only log PHI-touching requests
    path = request.url.path
    resource_type = None
    for prefix, rtype in PHI_RESOURCE_PREFIXES.items():
        if path.startswith(prefix):
            resource_type = rtype
            break

    if resource_type and response.status_code < 400:
        try:
            action = METHOD_ACTION_MAP.get(request.method, AuditAction.VIEW)
            ip = request.client.host if request.client else None
            ua = request.headers.get("user-agent")

            # Try to extract resource ID from path (e.g. /api/cases/abc-123)
            parts = path.rstrip("/").split("/")
            resource_id = None
            if len(parts) >= 4 and parts[3] not in ("", "compare"):
                resource_id = parts[3]

            # Try to get user from the request state (set by auth dependency)
            user_id = getattr(request.state, "user_id", None)
            user_email = getattr(request.state, "user_email", None)

            db = SessionLocal()
            try:
                entry = AuditLog(
                    user_id=user_id,
                    user_email=user_email,
                    guest_id=request.headers.get("x-guest-id"),
                    action=action,
                    resource_type=resource_type,
                    resource_id=resource_id,
                    ip_address=ip,
                    user_agent=ua[:500] if ua else None,
                    endpoint=f"{request.method} {path}",
                )
                db.add(entry)
                db.commit()
            except Exception as e:
                logger.warning("Audit log write failed: %s", e)
                db.rollback()
            finally:
                db.close()
        except Exception as e:
            # Never let audit logging break the request
            logger.warning("Audit middleware error: %s", e)

    return response
