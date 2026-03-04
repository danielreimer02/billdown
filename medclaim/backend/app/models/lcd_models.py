"""
SQLAlchemy models for CMS Medicare Coverage Database reference tables.

Loaded via ETL from CMS bulk-download CSVs (lcd_etl.py).
These power the LCD lookup feature — given CPT + ICD-10 + state,
determine whether Medicare covers the procedure.

Relationship chain:
  LCD → lcd_related_documents → Article → article_x_hcpc_code (CPT codes)
                                        → article_x_icd10_covered (covered diagnoses)
                                        → article_x_icd10_noncovered
                                        → article_x_contractor → contractor_jurisdiction → state_lookup
"""

from sqlalchemy import Column, String, Integer, DateTime, Text, Index
from app.db.session import Base


# ─────────────────────────────────────────
# LCD — Local Coverage Determination
# The top-level policy document
# ─────────────────────────────────────────

class LCD(Base):
    __tablename__ = "lcd"

    lcd_id = Column(Integer, primary_key=True)
    lcd_version = Column(Integer, primary_key=True)
    title = Column(Text)
    determination_number = Column(String(50))
    status = Column(String(20))
    display_id = Column(String(50))
    last_updated = Column(DateTime)


# ─────────────────────────────────────────
# Article — the billing/coding companion to an LCD
# Articles contain the CPT ↔ ICD-10 mappings
# ─────────────────────────────────────────

class Article(Base):
    __tablename__ = "article"

    article_id = Column(Integer, primary_key=True)
    article_version = Column(Integer, primary_key=True)
    article_type = Column(Integer)
    title = Column(Text)
    status = Column(String(20))
    last_updated = Column(DateTime)


# ─────────────────────────────────────────
# LCD ↔ Article link table
# ─────────────────────────────────────────

class LCDRelatedDocument(Base):
    __tablename__ = "lcd_related_documents"

    lcd_id = Column(Integer, primary_key=True)
    lcd_version = Column(Integer, primary_key=True)
    related_num = Column(Integer, primary_key=True)
    r_article_id = Column(Integer)
    r_article_version = Column(Integer)
    r_lcd_id = Column(Integer)
    r_lcd_version = Column(Integer)
    r_contractor_id = Column(Integer)
    last_updated = Column(DateTime)


# ─────────────────────────────────────────
# Article ↔ CPT/HCPCS code mapping
# ─────────────────────────────────────────

class ArticleHCPCCode(Base):
    __tablename__ = "article_x_hcpc_code"

    article_id = Column(Integer, primary_key=True)
    article_version = Column(Integer, primary_key=True)
    hcpc_code_id = Column(String(20), primary_key=True)
    hcpc_code_version = Column(Integer)
    hcpc_code_group = Column(Integer)
    range = Column(String(5))
    last_updated = Column(DateTime)
    long_description = Column(Text)
    short_description = Column(String(255))

    __table_args__ = (
        Index("ix_article_hcpc_code", "hcpc_code_id"),
    )


# ─────────────────────────────────────────
# Article ↔ ICD-10 COVERED diagnoses
# ─────────────────────────────────────────

class ArticleICD10Covered(Base):
    __tablename__ = "article_x_icd10_covered"

    article_id = Column(Integer, primary_key=True)
    article_version = Column(Integer, primary_key=True)
    icd10_code_id = Column(String(20), primary_key=True)
    icd10_code_version = Column(Integer)
    icd10_covered_group = Column(Integer, primary_key=True)
    range = Column(String(5))
    last_updated = Column(DateTime)
    sort_order = Column(Integer)
    description = Column(Text)
    asterisk = Column(String(5))

    __table_args__ = (
        Index("ix_article_icd10_covered_code", "icd10_code_id"),
    )


# ─────────────────────────────────────────
# Article ↔ ICD-10 NONCOVERED diagnoses
# ─────────────────────────────────────────

class ArticleICD10CoveredGroup(Base):
    """
    Group metadata for covered ICD-10 codes.
    Each article can have multiple groups. The paragraph field contains
    HTML text describing the group rule:
      - "stand-alone diagnosis codes" → codes in this group work alone
      - "Group X and Group Y must be billed" → combination required
    """
    __tablename__ = "article_x_icd10_covered_group"

    article_id = Column(Integer, primary_key=True)
    article_version = Column(Integer, primary_key=True)
    icd10_covered_group = Column(Integer, primary_key=True)
    paragraph = Column(Text)
    last_updated = Column(DateTime)


class ArticleICD10Noncovered(Base):
    __tablename__ = "article_x_icd10_noncovered"

    article_id = Column(Integer, primary_key=True)
    article_version = Column(Integer, primary_key=True)
    icd10_code_id = Column(String(20), primary_key=True)
    icd10_code_version = Column(Integer)
    icd10_noncovered_group = Column(Integer, primary_key=True)
    range = Column(String(5))
    last_updated = Column(DateTime)
    sort_order = Column(Integer)
    description = Column(Text)
    asterisk = Column(String(5))

    __table_args__ = (
        Index("ix_article_icd10_noncovered_code", "icd10_code_id"),
    )


class ArticleICD10NoncoveredGroup(Base):
    """Group metadata for noncovered ICD-10 codes."""
    __tablename__ = "article_x_icd10_noncovered_group"

    article_id = Column(Integer, primary_key=True)
    article_version = Column(Integer, primary_key=True)
    icd10_noncovered_group = Column(Integer, primary_key=True)
    paragraph = Column(Text)
    last_updated = Column(DateTime)


# ─────────────────────────────────────────
# Article ↔ Contractor (which MAC owns this article)
# ─────────────────────────────────────────

class ArticleContractor(Base):
    __tablename__ = "article_x_contractor"

    article_id = Column(Integer, primary_key=True)
    article_version = Column(Integer, primary_key=True)
    article_type = Column(Integer, primary_key=True)
    contractor_id = Column(Integer, primary_key=True)
    contractor_type_id = Column(Integer)
    contractor_version = Column(Integer)
    last_updated = Column(DateTime)

    __table_args__ = (
        Index("ix_article_contractor_id", "contractor_id"),
    )


# ─────────────────────────────────────────
# Contractor → State mapping
# ─────────────────────────────────────────

class ContractorJurisdiction(Base):
    __tablename__ = "contractor_jurisdiction"

    contractor_id = Column(Integer, primary_key=True)
    contractor_type_id = Column(Integer, primary_key=True)
    contractor_version = Column(Integer, primary_key=True)
    state_id = Column(Integer, primary_key=True)
    last_updated = Column(DateTime)
    active_date = Column(DateTime)
    term_date = Column(DateTime)

    __table_args__ = (
        Index("ix_contractor_jurisdiction_state", "state_id"),
    )


# ─────────────────────────────────────────
# State lookup (state_id → abbreviation)
# ─────────────────────────────────────────

class StateLookup(Base):
    __tablename__ = "state_lookup"

    state_id = Column(Integer, primary_key=True)
    state_abbrev = Column(String(10), index=True)
    description = Column(String(100))
