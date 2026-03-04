from sqlalchemy import (
    Column, String, Integer, Float, Boolean,
    DateTime, ForeignKey, Text, JSON, Enum
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.session import Base
import enum
import uuid


def generate_uuid():
    return str(uuid.uuid4())


# ─────────────────────────────────────────
# ENUMS
# ─────────────────────────────────────────

class CaseStatus(str, enum.Enum):
    UPLOADED       = "uploaded"         # document(s) uploaded, waiting for OCR
    OCR_PROCESSING = "ocr_processing"   # OCR running in background
    NEEDS_REVIEW   = "needs_review"     # codes extracted, user must confirm
    ANALYZING      = "analyzing"        # user confirmed, pipeline running
    ANALYZED       = "analyzed"         # analysis complete
    LETTERS_READY  = "letters_ready"    # dispute letters generated
    DISPUTED       = "disputed"         # letter sent
    RESOLVED       = "resolved"         # outcome known
    CLOSED         = "closed"


class DocumentType(str, enum.Enum):
    HOSPITAL_BILL  = "hospital_bill"
    ITEMIZED_BILL  = "itemized_bill"   # detailed line-item bill
    SUMMARY_BILL   = "summary_bill"    # summary / statement
    EOB            = "eob"             # Explanation of Benefits
    DENIAL_LETTER  = "denial_letter"
    MEDICAL_RECORD = "medical_record"
    AUTHORIZED_REP = "authorized_rep"  # authorized representative form
    OTHER          = "other"


class CaseType(str, enum.Enum):
    BILLING    = "billing"       # Steps 1-2: bill disputes (uninsured + insured)
    PRIOR_AUTH = "prior_auth"    # Step 3: patient-side denial appeals
    PHYSICIAN  = "physician"     # Step 4: physician-side prior auth tool


class DisputeType(str, enum.Enum):
    BILLING_ERROR   = "billing_error"    # CPT/ICD mismatch
    NCCI_VIOLATION  = "ncci_violation"   # unbundling
    MUE_VIOLATION   = "mue_violation"    # too many units
    PRICE_DISPUTE   = "price_dispute"    # chargemaster vs Medicare
    CHARITY_CARE    = "charity_care"     # income-based eligibility
    PRIOR_AUTH      = "prior_auth"       # denial appeal


# ─────────────────────────────────────────
# USER
# ─────────────────────────────────────────

class User(Base):
    __tablename__ = "users"

    id             = Column(String, primary_key=True, default=generate_uuid)
    email          = Column(String, unique=True, nullable=False, index=True)
    hashed_password = Column(String, nullable=False)
    full_name      = Column(String)
    is_physician   = Column(Boolean, default=False)
    is_active      = Column(Boolean, default=True)
    created_at     = Column(DateTime(timezone=True), server_default=func.now())

    cases    = relationship("Case", back_populates="user")


# ─────────────────────────────────────────
# CASE
# Core unit of work — one bill = one case
# ─────────────────────────────────────────

class Case(Base):
    __tablename__ = "cases"

    id           = Column(String, primary_key=True, default=generate_uuid)
    user_id      = Column(String, ForeignKey("users.id"), nullable=True)
    case_type    = Column(Enum(CaseType, values_callable=lambda e: [x.value for x in e]), default=CaseType.BILLING, nullable=False)
    status       = Column(Enum(CaseStatus, values_callable=lambda e: [x.value for x in e]), default=CaseStatus.UPLOADED)

    # Patient context (no PHI required — just codes)
    state        = Column(String(2))        # TX, CO etc — for charity care rules
    locality     = Column(String(5))        # GPCI locality number — for accurate pricing
    household_size = Column(Integer)        # for FPL calculation
    annual_income  = Column(Float)          # for charity care eligibility

    # What was billed (extracted from documents)
    provider_name  = Column(String)
    service_date   = Column(DateTime)
    total_billed   = Column(Float)
    total_paid     = Column(Float)          # what patient already paid
    balance_due    = Column(Float)

    # Outcome
    savings_found  = Column(Float, default=0.0)
    savings_achieved = Column(Float, default=0.0)
    our_fee        = Column(Float, default=0.0)

    notes          = Column(Text)
    created_at     = Column(DateTime(timezone=True), server_default=func.now())
    updated_at     = Column(DateTime(timezone=True), onupdate=func.now())

    user        = relationship("User", back_populates="cases")
    documents   = relationship("Document", back_populates="case", cascade="all, delete-orphan")
    line_items  = relationship("LineItem", back_populates="case", cascade="all, delete-orphan")
    disputes    = relationship("Dispute", back_populates="case", cascade="all, delete-orphan")


# ─────────────────────────────────────────
# DOCUMENT
# Each uploaded file attached to a case
# ─────────────────────────────────────────

class Document(Base):
    __tablename__ = "documents"

    id            = Column(String, primary_key=True, default=generate_uuid)
    case_id       = Column(String, ForeignKey("cases.id"), nullable=False)
    document_type = Column(Enum(DocumentType, values_callable=lambda e: [x.value for x in e]))
    file_name     = Column(String)
    storage_path  = Column(String)          # S3/Spaces path
    is_native_pdf = Column(Boolean)         # native vs scanned
    ocr_completed = Column(Boolean, default=False)
    raw_text      = Column(Text)            # extracted text
    created_at    = Column(DateTime(timezone=True), server_default=func.now())

    case = relationship("Case", back_populates="documents")


# ─────────────────────────────────────────
# LINE ITEM
# Each CPT code billed on a document
# ─────────────────────────────────────────

class LineItem(Base):
    __tablename__ = "line_items"

    id              = Column(String, primary_key=True, default=generate_uuid)
    case_id         = Column(String, ForeignKey("cases.id"), nullable=False)
    document_id     = Column(String, ForeignKey("documents.id"))

    cpt_code        = Column(String(10), index=True)
    cpt_description = Column(String)
    icd10_codes     = Column(JSON)          # list of ICD-10 codes for this line
    units           = Column(Integer, default=1)
    amount_billed   = Column(Float)
    amount_allowed  = Column(Float)         # what insurance allowed
    amount_paid     = Column(Float)         # what was actually paid

    # User confirmation — analysis ONLY runs after this is True
    user_confirmed  = Column(Boolean, default=False)

    # Analysis results (populated by BackgroundTask after confirmation)
    medicare_rate   = Column(Float)         # CMS published rate
    cash_price      = Column(Float)         # hospital published cash price
    ncci_violation  = Column(Boolean)       # unbundling flag
    mue_violation   = Column(Boolean)       # too many units flag
    flags           = Column(JSON)          # list of issue descriptions

    case     = relationship("Case", back_populates="line_items")
    document = relationship("Document")


# ─────────────────────────────────────────
# DISPUTE
# One dispute per issue found
# ─────────────────────────────────────────

class Dispute(Base):
    __tablename__ = "disputes"

    id           = Column(String, primary_key=True, default=generate_uuid)
    case_id      = Column(String, ForeignKey("cases.id"), nullable=False)
    dispute_type = Column(Enum(DisputeType, values_callable=lambda e: [x.value for x in e]))
    description  = Column(Text)             # plain english explanation
    legal_basis  = Column(Text)             # LCD number, NCCI rule, etc
    amount_disputed = Column(Float)
    letter_text  = Column(Text)             # generated dispute letter
    sent_at      = Column(DateTime)
    resolved_at  = Column(DateTime)
    amount_saved = Column(Float)

    created_at   = Column(DateTime(timezone=True), server_default=func.now())

    case = relationship("Case", back_populates="disputes")
