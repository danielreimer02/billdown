"""
LCD (Local Coverage Determination) service.

LCDs are the rules that define when Medicare will cover a procedure.
If Medicare covers it → private insurance must cover it.
If they deny it → your patient appeal letter cites this LCD.

PRIMARY: Local Postgres (loaded by lcd_etl.py from CMS bulk CSVs)
FALLBACK: CMS public API (if local data not loaded)

Query chain:
  state → state_lookup → contractor_jurisdiction → article_x_contractor
       → article_x_hcpc_code (match CPT)
       → article_x_icd10_covered / noncovered (match ICD-10)
       → lcd_related_documents → lcd (get LCD title)
"""

import logging
from dataclasses import dataclass, field

import httpx
from sqlalchemy import text
from app.db.session import engine

logger = logging.getLogger(__name__)


@dataclass
class LCDCoverageResult:
    lcd_id: str | None
    lcd_title: str | None
    article_id: str | None
    article_title: str | None
    cpt_code: str
    icd10_code: str
    icd10_description: str | None
    covered: bool
    covered_icd10_codes: list[dict] = field(default_factory=list)
    documentation_criteria: list[str] = field(default_factory=list)
    source: str = "local"  # "local" or "api"


# ─────────────────────────────────────────
# STATE ALIASING
# Some states have sub-jurisdictions in CMS data
# e.g. CA has NF (Northern) and SF (Southern)
# ─────────────────────────────────────────

STATE_ALIASES: dict[str, list[str]] = {
    "CA": ["CA", "NF", "SF"],
    "NY": ["NY", "DN", "QN", "UN"],
    "MO": ["MO", "EM", "WM"],
}


def _state_abbrevs(state: str) -> list[str]:
    """Expand a state code to include its sub-jurisdictions."""
    upper = state.upper()
    return STATE_ALIASES.get(upper, [upper])


# ─────────────────────────────────────────
# SQL QUERIES
# ─────────────────────────────────────────

# Is this CPT + ICD-10 COVERED in this state?
COVERAGE_QUERY = text("""
    SELECT DISTINCT
        l.lcd_id,
        l.title AS lcd_title,
        a.article_id,
        a.title AS article_title,
        cov.icd10_code_id,
        cov.description AS icd10_description
    FROM article_x_hcpc_code h
    JOIN article_x_icd10_covered cov
        ON cov.article_id = h.article_id
        AND cov.article_version = h.article_version
    JOIN article a
        ON a.article_id = h.article_id
        AND a.article_version = h.article_version
    JOIN lcd_related_documents lrd
        ON lrd.r_article_id = a.article_id
    JOIN lcd l
        ON l.lcd_id = lrd.lcd_id
        AND l.lcd_version = lrd.lcd_version
    JOIN article_x_contractor ac
        ON ac.article_id = a.article_id
        AND ac.article_version = a.article_version
    JOIN contractor_jurisdiction cj
        ON cj.contractor_id = ac.contractor_id
    JOIN state_lookup sl
        ON sl.state_id = cj.state_id
    WHERE h.hcpc_code_id = :cpt_code
      AND cov.icd10_code_id = :icd10_code
      AND sl.state_abbrev IN :states
    LIMIT 1
""")

# Is this CPT + ICD-10 explicitly NONCOVERED?
NONCOVERAGE_QUERY = text("""
    SELECT DISTINCT
        l.lcd_id,
        l.title AS lcd_title,
        a.article_id,
        a.title AS article_title,
        nc.icd10_code_id,
        nc.description AS icd10_description
    FROM article_x_hcpc_code h
    JOIN article_x_icd10_noncovered nc
        ON nc.article_id = h.article_id
        AND nc.article_version = h.article_version
    JOIN article a
        ON a.article_id = h.article_id
        AND a.article_version = h.article_version
    JOIN lcd_related_documents lrd
        ON lrd.r_article_id = a.article_id
    JOIN lcd l
        ON l.lcd_id = lrd.lcd_id
        AND l.lcd_version = lrd.lcd_version
    JOIN article_x_contractor ac
        ON ac.article_id = a.article_id
        AND ac.article_version = a.article_version
    JOIN contractor_jurisdiction cj
        ON cj.contractor_id = ac.contractor_id
    JOIN state_lookup sl
        ON sl.state_id = cj.state_id
    WHERE h.hcpc_code_id = :cpt_code
      AND nc.icd10_code_id = :icd10_code
      AND sl.state_abbrev IN :states
    LIMIT 1
""")

# Sample of covered ICD-10 codes for same CPT + article (for display)
COVERED_SAMPLE_QUERY = text("""
    SELECT DISTINCT
        cov.icd10_code_id AS code,
        cov.description
    FROM article_x_icd10_covered cov
    WHERE cov.article_id = :article_id
      AND cov.article_version = :article_version
    ORDER BY cov.icd10_code_id
    LIMIT 20
""")


# ─────────────────────────────────────────
# LOCAL SQL LOOKUP (primary)
# ─────────────────────────────────────────

def lookup_lcd_local(
    cpt_code: str, icd10_code: str, state: str
) -> LCDCoverageResult | None:
    """
    Query local Postgres for LCD coverage.
    Returns None if local data isn't loaded or no match found.
    """
    states = tuple(_state_abbrevs(state))

    try:
        with engine.connect() as conn:
            # 1. Check COVERED
            row = conn.execute(
                COVERAGE_QUERY,
                {"cpt_code": cpt_code, "icd10_code": icd10_code, "states": states},
            ).first()

            if row:
                # Get sample covered codes for this article
                samples = conn.execute(
                    COVERED_SAMPLE_QUERY,
                    {
                        "article_id": row.article_id,
                        "article_version": _get_article_version(conn, row.article_id),
                    },
                ).fetchall()

                return LCDCoverageResult(
                    lcd_id=str(row.lcd_id),
                    lcd_title=row.lcd_title,
                    article_id=str(row.article_id),
                    article_title=row.article_title,
                    cpt_code=cpt_code,
                    icd10_code=icd10_code,
                    icd10_description=row.icd10_description,
                    covered=True,
                    covered_icd10_codes=[
                        {"code": s.code, "description": s.description or ""}
                        for s in samples
                    ],
                    source="local",
                )

            # 2. Check NONCOVERED
            row = conn.execute(
                NONCOVERAGE_QUERY,
                {"cpt_code": cpt_code, "icd10_code": icd10_code, "states": states},
            ).first()

            if row:
                return LCDCoverageResult(
                    lcd_id=str(row.lcd_id),
                    lcd_title=row.lcd_title,
                    article_id=str(row.article_id),
                    article_title=row.article_title,
                    cpt_code=cpt_code,
                    icd10_code=icd10_code,
                    icd10_description=row.icd10_description,
                    covered=False,
                    source="local",
                )

            # 3. No LCD found for this combo
            return None

    except Exception as e:
        logger.warning(f"Local LCD lookup failed: {e}")
        return None


def _get_article_version(conn, article_id: int) -> int:
    """Get the latest version of an article."""
    result = conn.execute(
        text("SELECT MAX(article_version) FROM article WHERE article_id = :id"),
        {"id": article_id},
    ).scalar()
    return result or 1


# ─────────────────────────────────────────
# CMS API FALLBACK
# ─────────────────────────────────────────

CMS_LCD_API = "https://api.coverage-finder.cms.gov/api/v1"


async def lookup_lcd_api(cpt_code: str, icd10_code: str) -> LCDCoverageResult | None:
    """Fallback: query CMS API if local data not available."""
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(
                f"{CMS_LCD_API}/lcd",
                params={
                    "hcpcs_code": cpt_code,
                    "icd_10_cm_code": icd10_code,
                },
                timeout=10.0,
            )
            response.raise_for_status()
            data = response.json()

            if not data.get("items"):
                return None

            lcd = data["items"][0]
            return LCDCoverageResult(
                lcd_id=lcd.get("lcd_id", ""),
                lcd_title=lcd.get("title", ""),
                article_id=None,
                article_title=None,
                cpt_code=cpt_code,
                icd10_code=icd10_code,
                icd10_description=None,
                covered=True,
                covered_icd10_codes=[
                    {"code": c, "description": ""} if isinstance(c, str) else c
                    for c in lcd.get("icd_10_cm_codes", [])
                ],
                source="api",
            )

        except httpx.HTTPError:
            return None


# ─────────────────────────────────────────
# MAIN ENTRY POINT
# ─────────────────────────────────────────

async def lookup_lcd(
    cpt_code: str, icd10_code: str, state: str = ""
) -> LCDCoverageResult | None:
    """
    Main lookup: try local SQL first, fall back to CMS API.
    """
    # Try local first (fast, comprehensive)
    if state:
        result = lookup_lcd_local(cpt_code, icd10_code, state)
        if result:
            return result

    # Fallback to API
    logger.info(f"Falling back to CMS API for {cpt_code}/{icd10_code}")
    return await lookup_lcd_api(cpt_code, icd10_code)


async def get_medicare_rate(cpt_code: str, state: str) -> float | None:
    """
    CMS Physician Fee Schedule — what Medicare pays for this CPT in this state.
    Used to show "you were charged 4.5x Medicare rate".
    Fee schedule data is not in the LCD CSVs, so this always hits the API.
    """
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(
                f"{CMS_LCD_API}/fee-schedule",
                params={
                    "hcpcs_code": cpt_code,
                    "state": state,
                    "year": "2024",
                },
                timeout=10.0,
            )
            response.raise_for_status()
            data = response.json()
            return data.get("non_facility_price")
        except (httpx.HTTPError, KeyError):
            return None
