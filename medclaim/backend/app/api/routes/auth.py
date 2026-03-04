"""
Authentication routes:  register, login, get current user.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import (
    get_db,
    hash_password,
    verify_password,
    create_access_token,
    require_current_user,
)
from app.models.models import User, UserRole
from app.schemas.auth import UserRegister, UserLogin, UserOut, TokenResponse

router = APIRouter()


# ── Register ──

@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register(body: UserRegister, db: Session = Depends(get_db)):
    """Create a new user account and return an access token."""

    # Check duplicate email
    existing = db.execute(select(User).where(User.email == body.email)).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")

    # Validate role
    try:
        role = UserRole(body.role)
    except ValueError:
        raise HTTPException(status_code=422, detail=f"Invalid role: {body.role}")

    # Create user
    user = User(
        email=body.email,
        hashed_password=hash_password(body.password),
        full_name=body.full_name,
        role=role,
        company_name=body.company_name if role in (UserRole.COMPANY, UserRole.EMPLOYEE) else None,
        npi=body.npi if role == UserRole.PHYSICIAN else None,
        is_physician=(role == UserRole.PHYSICIAN),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token({"sub": user.id, "role": user.role.value})
    return TokenResponse(
        access_token=token,
        user=UserOut.model_validate(user),
    )


# ── Login ──

@router.post("/login", response_model=TokenResponse)
def login(body: UserLogin, db: Session = Depends(get_db)):
    """Authenticate with email + password, return access token."""

    user = db.execute(select(User).where(User.email == body.email)).scalar_one_or_none()
    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account disabled")

    token = create_access_token({"sub": user.id, "role": user.role.value})
    return TokenResponse(
        access_token=token,
        user=UserOut.model_validate(user),
    )


# ── Current user ──

@router.get("/me", response_model=UserOut)
def get_me(user: User = Depends(require_current_user)):
    """Return the currently authenticated user."""
    return UserOut.model_validate(user)
