"""
Billing reference data models — NCCI PTP, MUE, and Physician Fee Schedule.

These are CMS reference datasets loaded via ETL (billing_etl.py).
They power the bill analysis pipeline:
  - NCCI PTP  → unbundling check (two CPTs that can't be billed together)
  - MUE       → quantity check (max units per CPT per day)
  - PFS       → price check (what Medicare pays vs what you were charged)
"""

from sqlalchemy import Column, String, Integer, Float, Date, Index
from app.db.session import Base


# ─────────────────────────────────────────
# NCCI PTP (Procedure-to-Procedure) Edits
# "Column 1 CPT includes Column 2 CPT"
# ─────────────────────────────────────────

class NcciPtp(Base):
    __tablename__ = "ncci_ptp"

    id              = Column(Integer, primary_key=True, autoincrement=True)
    setting         = Column(String(15), nullable=False)   # "practitioner" or "hospital"
    column1_cpt     = Column(String(10), nullable=False, index=True)
    column2_cpt     = Column(String(10), nullable=False, index=True)
    effective_date  = Column(Date)
    deletion_date   = Column(Date)                         # NULL = still active
    modifier_ind    = Column(String(1))                    # 0=never, 1=allowed, 9=n/a
    rationale       = Column(String(255))

    __table_args__ = (
        Index("ix_ncci_ptp_pair", "column1_cpt", "column2_cpt"),
        Index("ix_ncci_ptp_pair_reverse", "column2_cpt", "column1_cpt"),
        Index("ix_ncci_ptp_setting_pair", "setting", "column1_cpt", "column2_cpt"),
    )


# ─────────────────────────────────────────
# NCCI MUE (Medically Unlikely Edits)
# Max units of a CPT per patient per day
# ─────────────────────────────────────────

class NcciMue(Base):
    __tablename__ = "ncci_mue"

    id              = Column(Integer, primary_key=True, autoincrement=True)
    setting         = Column(String(15), nullable=False)   # "practitioner" or "hospital"
    cpt_code        = Column(String(10), nullable=False, index=True)
    mue_value       = Column(Integer, nullable=False)      # max units per day
    mai             = Column(String(1))                    # 1=line, 2=absolute, 3=date-of-service
    rationale       = Column(String(255))                  # MUE rationale from CMS
    effective_date  = Column(Date)

    __table_args__ = (
        Index("ix_ncci_mue_setting_cpt", "setting", "cpt_code"),
    )


# ─────────────────────────────────────────
# Physician Fee Schedule — RVU Table
# National RVUs per CPT. Multiply by GPCI × CF for payment.
# Source: PPRRVU2026_Jan_nonQPP.csv (~19K rows)
# ─────────────────────────────────────────

class PfsRvu(Base):
    __tablename__ = "pfs_rvu"

    id              = Column(Integer, primary_key=True, autoincrement=True)
    hcpcs           = Column(String(10), nullable=False, index=True)
    modifier        = Column(String(2))
    description     = Column(String(255))
    status_code     = Column(String(1))                    # A=active, I=inactive, etc.
    work_rvu        = Column(Float, default=0.0)           # physician work
    nonfac_pe_rvu   = Column(Float, default=0.0)           # non-facility practice expense
    facility_pe_rvu = Column(Float, default=0.0)           # facility practice expense
    mp_rvu          = Column(Float, default=0.0)           # malpractice
    nonfac_total    = Column(Float, default=0.0)           # work + nonfac_pe + mp
    facility_total  = Column(Float, default=0.0)           # work + facility_pe + mp
    conv_factor     = Column(Float, default=0.0)           # conversion factor ($33.4009 for 2026)

    __table_args__ = (
        Index("ix_pfs_rvu_hcpcs_mod", "hcpcs", "modifier"),
    )


# ─────────────────────────────────────────
# GPCI — Geographic Practice Cost Indices
# Locality-level multipliers for RVU components.
# Source: GPCI2026.csv (~119 rows)
# Payment = (Work_RVU × PW_GPCI + PE_RVU × PE_GPCI + MP_RVU × MP_GPCI) × CF
# ─────────────────────────────────────────

class GpciLocality(Base):
    __tablename__ = "gpci_locality"

    id              = Column(Integer, primary_key=True, autoincrement=True)
    mac             = Column(String(10))                   # Medicare Administrative Contractor
    state           = Column(String(2), nullable=False, index=True)
    locality_number = Column(String(5), nullable=False)
    locality_name   = Column(String(100))
    counties        = Column(String(500))                  # counties covered (from 26LOCCO)
    pw_gpci         = Column(Float, default=1.0)           # work GPCI (with 1.0 floor)
    pe_gpci         = Column(Float, default=1.0)           # practice expense GPCI
    mp_gpci         = Column(Float, default=1.0)           # malpractice GPCI

    __table_args__ = (
        Index("ix_gpci_state_locality", "state", "locality_number"),
    )

