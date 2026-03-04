"""
Billing analysis API routes.

Main endpoint: POST /api/billing/analyze
  — Takes a full bill, runs the entire pipeline, returns all flags.

Debug endpoints:
  GET /api/billing/ncci/check-pair  — manual unbundling check
  GET /api/billing/mue/check        — manual MUE check
  GET /api/billing/pfs/rate          — manual price check
"""

from fastapi import APIRouter, Query
from pydantic import BaseModel
from typing import Optional
from sqlalchemy import text

from app.services.billing_service import (
    BillLine,
    analyze_bill,
    check_bundling_pair,
    check_mue_single,
    check_price_single,
    get_localities,
)
from app.db.session import engine

router = APIRouter()


# ─────────────────────────────────────────
# MAIN PIPELINE ENDPOINT
# ─────────────────────────────────────────

class BillLineInput(BaseModel):
    cpt: str
    units: int = 1
    charge: float = 0.0
    description: str = ""


class AnalyzeBillRequest(BaseModel):
    state: str = ""
    setting: str = "hospital"  # "hospital" or "practitioner"
    lines: list[BillLineInput]


@router.post("/analyze")
async def analyze_bill_endpoint(req: AnalyzeBillRequest):
    """
    Full bill analysis — one request, one response.

    Send all CPT lines from a bill. Returns:
    - Bundling issues (NCCI PTP)
    - Quantity issues (MUE)
    - Pricing issues (PFS)
    - Estimated total overcharge
    """
    bill_lines = [
        BillLine(
            cpt_code=line.cpt,
            units=line.units,
            charge=line.charge,
            description=line.description,
        )
        for line in req.lines
    ]

    result = analyze_bill(
        lines=bill_lines,
        state=req.state,
        setting=req.setting,
    )

    return {
        "summary": result.summary,
        "totalOverchargeEstimate": result.total_overcharge_estimate,
        "bundlingFlags": [
            {
                "cpt1": f.cpt1,
                "cpt2": f.cpt2,
                "setting": f.setting,
                "modifierInd": f.modifier_ind,
                "rationale": f.rationale,
                "detail": f.detail,
            }
            for f in result.bundling_flags
        ],
        "mueFlags": [
            {
                "cptCode": f.cpt_code,
                "billedUnits": f.billed_units,
                "maxUnits": f.max_units,
                "setting": f.setting,
                "mai": f.mai,
                "detail": f.detail,
            }
            for f in result.mue_flags
        ],
        "priceFlags": [
            {
                "cptCode": f.cpt_code,
                "charged": f.charged,
                "medicareRate": f.medicare_rate,
                "ratio": f.ratio,
                "detail": f.detail,
            }
            for f in result.price_flags
        ],
    }


# ─────────────────────────────────────────
# DEBUG / MANUAL CHECK ENDPOINTS
# ─────────────────────────────────────────

@router.get("/ncci/check-pair")
async def ncci_check_pair(
    cpt1: str = Query(..., description="First CPT code"),
    cpt2: str = Query(..., description="Second CPT code"),
):
    """Check if two CPTs are bundled (NCCI PTP edit)."""
    flags = check_bundling_pair(cpt1, cpt2)
    return {
        "cpt1": cpt1,
        "cpt2": cpt2,
        "bundled": len(flags) > 0,
        "flags": [
            {
                "cpt1": f.cpt1,
                "cpt2": f.cpt2,
                "setting": f.setting,
                "modifierInd": f.modifier_ind,
                "rationale": f.rationale,
                "detail": f.detail,
            }
            for f in flags
        ],
        "message": (
            f"CPT {cpt1} and {cpt2} are {'BUNDLED' if flags else 'NOT bundled'}"
        ),
    }


@router.get("/mue/check")
async def mue_check(
    cpt: str = Query(..., description="CPT code to check"),
):
    """Get MUE limit for a CPT code."""
    results = check_mue_single(cpt)
    return {
        "cptCode": cpt,
        "limits": results,
        "message": (
            f"MUE limit for {cpt}: {results[0]['mueValue']} units/day"
            if results
            else f"No MUE data found for CPT {cpt}"
        ),
    }


@router.get("/pfs/localities")
async def pfs_localities(
    state: str = Query(..., description="Two-letter state abbreviation"),
):
    """
    List all GPCI localities for a state with their GPCI factors.
    Use the locality_number with /pfs/rate for precise pricing.
    """
    localities = get_localities(state)
    if not localities:
        return {
            "state": state.upper(),
            "localities": [],
            "message": f"No localities found for state '{state}'",
        }
    return {
        "state": state.upper(),
        "localities": localities,
        "message": f"{len(localities)} localit{'y' if len(localities) == 1 else 'ies'} for {state.upper()}",
    }


@router.get("/pfs/rate")
async def pfs_rate(
    cpt: str = Query(..., description="CPT code"),
    state: Optional[str] = Query(None, description="State abbreviation for GPCI-adjusted rate"),
    locality: Optional[str] = Query(None, description="Locality number for precise GPCI (from /pfs/localities)"),
    setting: str = Query("nonfacility", description="'facility' or 'nonfacility'"),
):
    """
    Get Medicare rate for a CPT code.
    Without state: returns national rate (total RVU × CF).
    With state: returns GPCI-adjusted rate (first locality unless locality specified).
    With state + locality: returns rate for that exact GPCI locality.
    """
    result = check_price_single(cpt, state=state, locality=locality, setting=setting)
    if not result:
        return {
            "cptCode": cpt,
            "rate": None,
            "message": f"No fee schedule data found for CPT {cpt}",
        }

    return {
        "cptCode": cpt,
        "rate": result,
        "message": (
            f"Medicare rate for {cpt}: ${result['payment']:,.2f} "
            f"({result['source']})"
        ),
    }


# ─────────────────────────────────────────
# CODE DESCRIPTION LOOKUPS
# ─────────────────────────────────────────

@router.get("/cpt-description")
async def cpt_description(
    cpt: str = Query(..., description="CPT/HCPCS code e.g. 27447"),
):
    """
    Look up the CMS description for a CPT/HCPCS code from the Physician Fee Schedule.
    Returns the official Medicare description and basic RVU info.
    """
    try:
        with engine.connect() as conn:
            row = conn.execute(
                text("""
                    SELECT hcpcs, description, status_code,
                           work_rvu, nonfac_pe_rvu, facility_pe_rvu, mp_rvu,
                           nonfac_total, facility_total
                    FROM pfs_rvu
                    WHERE hcpcs = :hcpcs AND modifier IS NULL
                    LIMIT 1
                """),
                {"hcpcs": cpt.strip()},
            ).first()

            if not row:
                return {
                    "cptCode": cpt,
                    "description": None,
                    "message": f"No description found for CPT {cpt}",
                }

            return {
                "cptCode": row.hcpcs,
                "description": row.description,
                "statusCode": row.status_code,
                "workRvu": row.work_rvu,
                "nonfacPeRvu": row.nonfac_pe_rvu,
                "facilityPeRvu": row.facility_pe_rvu,
                "mpRvu": row.mp_rvu,
                "nonfacTotal": row.nonfac_total,
                "facilityTotal": row.facility_total,
                "message": f"{cpt}: {row.description}",
            }
    except Exception as e:
        return {
            "cptCode": cpt,
            "description": None,
            "message": f"Lookup failed: {str(e)}",
        }


@router.get("/icd10-description")
async def icd10_description(
    icd10: str = Query(..., description="ICD-10 code e.g. M17.11"),
):
    """
    Look up the description for an ICD-10 code from the LCD coverage database.
    Searches both covered and noncovered ICD-10 tables for the description.
    """
    try:
        with engine.connect() as conn:
            # Try covered codes first (larger dataset, more likely to have it)
            row = conn.execute(
                text("""
                    SELECT DISTINCT icd10_code_id, description
                    FROM article_x_icd10_covered
                    WHERE icd10_code_id = :icd10 AND description IS NOT NULL AND description != ''
                    LIMIT 1
                """),
                {"icd10": icd10.strip().upper()},
            ).first()

            if not row:
                # Try noncovered codes
                row = conn.execute(
                    text("""
                        SELECT DISTINCT icd10_code_id, description
                        FROM article_x_icd10_noncovered
                        WHERE icd10_code_id = :icd10 AND description IS NOT NULL AND description != ''
                        LIMIT 1
                    """),
                    {"icd10": icd10.strip().upper()},
                ).first()

            if not row:
                return {
                    "icd10Code": icd10,
                    "description": None,
                    "message": f"No description found for ICD-10 {icd10}",
                }

            return {
                "icd10Code": row.icd10_code_id,
                "description": row.description,
                "message": f"{row.icd10_code_id}: {row.description}",
            }
    except Exception as e:
        return {
            "icd10Code": icd10,
            "description": None,
            "message": f"Lookup failed: {str(e)}",
        }


# ─────────────────────────────────────────
# EXPLORER — browse/search CMS datasets
# ─────────────────────────────────────────

@router.get("/explorer/mue")
async def explorer_mue(
    search: Optional[str] = Query(None, description="Search by CPT code"),
    setting: Optional[str] = Query(None, description="Filter by setting e.g. 'Practitioner'"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
):
    """Browse NCCI MUE limits with search and pagination."""
    try:
        with engine.connect() as conn:
            conditions = ["1=1"]
            params: dict = {"limit": page_size, "offset": (page - 1) * page_size}

            if search:
                conditions.append("m.cpt_code LIKE :search")
                params["search"] = f"%{search.strip()}%"
            if setting:
                conditions.append("LOWER(m.setting) = :setting")
                params["setting"] = setting.lower()

            where = " AND ".join(conditions)

            total = conn.execute(
                text(f"SELECT COUNT(*) FROM ncci_mue m WHERE {where}"), params
            ).scalar() or 0

            rows = conn.execute(
                text(f"""
                    SELECT m.cpt_code, m.mue_value, m.setting, m.mai, m.rationale,
                           m.effective_date,
                           p.description
                    FROM ncci_mue m
                    LEFT JOIN LATERAL (
                        SELECT description FROM pfs_rvu
                        WHERE hcpcs = m.cpt_code AND modifier IS NULL
                        LIMIT 1
                    ) p ON true
                    WHERE {where}
                    ORDER BY m.cpt_code, m.setting
                    LIMIT :limit OFFSET :offset
                """),
                params,
            ).fetchall()

            return {
                "total": total,
                "page": page,
                "pageSize": page_size,
                "totalPages": (total + page_size - 1) // page_size,
                "rows": [
                    {
                        "cptCode": r.cpt_code,
                        "mueValue": r.mue_value,
                        "setting": r.setting,
                        "mai": r.mai,
                        "rationale": r.rationale,
                        "effectiveDate": str(r.effective_date) if r.effective_date else None,
                        "description": r.description,
                    }
                    for r in rows
                ],
            }
    except Exception as e:
        return {"total": 0, "page": 1, "pageSize": page_size, "totalPages": 0, "rows": [], "error": str(e)}


@router.get("/explorer/pfs")
async def explorer_pfs(
    search: Optional[str] = Query(None, description="Search by CPT code or description"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
):
    """Browse Physician Fee Schedule RVU data with search and pagination."""
    try:
        with engine.connect() as conn:
            conditions = ["modifier IS NULL"]
            params: dict = {"limit": page_size, "offset": (page - 1) * page_size}

            if search:
                s = search.strip()
                conditions.append(
                    "(hcpcs LIKE :search OR LOWER(description) LIKE :search_lower)"
                )
                params["search"] = f"%{s}%"
                params["search_lower"] = f"%{s.lower()}%"

            where = " AND ".join(conditions)

            total = conn.execute(
                text(f"SELECT COUNT(*) FROM pfs_rvu WHERE {where}"), params
            ).scalar() or 0

            rows = conn.execute(
                text(f"""
                    SELECT hcpcs, description, status_code,
                           work_rvu, nonfac_pe_rvu, facility_pe_rvu, mp_rvu,
                           nonfac_total, facility_total, conv_factor
                    FROM pfs_rvu
                    WHERE {where}
                    ORDER BY hcpcs
                    LIMIT :limit OFFSET :offset
                """),
                params,
            ).fetchall()

            return {
                "total": total,
                "page": page,
                "pageSize": page_size,
                "totalPages": (total + page_size - 1) // page_size,
                "rows": [
                    {
                        "hcpcs": r.hcpcs,
                        "description": r.description,
                        "statusCode": r.status_code,
                        "workRvu": r.work_rvu,
                        "nonfacPeRvu": r.nonfac_pe_rvu,
                        "facilityPeRvu": r.facility_pe_rvu,
                        "mpRvu": r.mp_rvu,
                        "nonfacTotal": r.nonfac_total,
                        "facilityTotal": r.facility_total,
                        "convFactor": r.conv_factor,
                    }
                    for r in rows
                ],
            }
    except Exception as e:
        return {"total": 0, "page": 1, "pageSize": page_size, "totalPages": 0, "rows": [], "error": str(e)}


@router.get("/explorer/ptp")
async def explorer_ptp(
    search: Optional[str] = Query(None, description="Search by CPT code"),
    setting: Optional[str] = Query(None, description="Filter by setting"),
    active_only: bool = Query(True, description="Only show active (not deleted) edits"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
):
    """Browse NCCI PTP bundling edits with search and pagination."""
    try:
        with engine.connect() as conn:
            conditions = ["1=1"]
            params: dict = {"limit": page_size, "offset": (page - 1) * page_size}

            if search:
                s = search.strip()
                conditions.append(
                    "(p.column1_cpt LIKE :search OR p.column2_cpt LIKE :search)"
                )
                params["search"] = f"%{s}%"
            if setting:
                conditions.append("LOWER(p.setting) = :setting")
                params["setting"] = setting.lower()
            if active_only:
                conditions.append("(p.deletion_date IS NULL OR p.deletion_date > CURRENT_DATE)")

            where = " AND ".join(conditions)

            total = conn.execute(
                text(f"SELECT COUNT(*) FROM ncci_ptp p WHERE {where}"), params
            ).scalar() or 0

            rows = conn.execute(
                text(f"""
                    SELECT p.column1_cpt, p.column2_cpt, p.setting,
                           p.effective_date, p.deletion_date, p.modifier_ind, p.rationale,
                           d1.description AS desc1, d2.description AS desc2
                    FROM ncci_ptp p
                    LEFT JOIN LATERAL (
                        SELECT description FROM pfs_rvu
                        WHERE hcpcs = p.column1_cpt AND modifier IS NULL
                        LIMIT 1
                    ) d1 ON true
                    LEFT JOIN LATERAL (
                        SELECT description FROM pfs_rvu
                        WHERE hcpcs = p.column2_cpt AND modifier IS NULL
                        LIMIT 1
                    ) d2 ON true
                    WHERE {where}
                    ORDER BY p.column1_cpt, p.column2_cpt
                    LIMIT :limit OFFSET :offset
                """),
                params,
            ).fetchall()

            return {
                "total": total,
                "page": page,
                "pageSize": page_size,
                "totalPages": (total + page_size - 1) // page_size,
                "rows": [
                    {
                        "column1Cpt": r.column1_cpt,
                        "column2Cpt": r.column2_cpt,
                        "setting": r.setting,
                        "effectiveDate": str(r.effective_date) if r.effective_date else None,
                        "deletionDate": str(r.deletion_date) if r.deletion_date else None,
                        "modifierInd": r.modifier_ind,
                        "rationale": r.rationale,
                        "desc1": r.desc1,
                        "desc2": r.desc2,
                    }
                    for r in rows
                ],
            }
    except Exception as e:
        return {"total": 0, "page": 1, "pageSize": page_size, "totalPages": 0, "rows": [], "error": str(e)}


@router.get("/explorer/icd10")
async def explorer_icd10(
    search: Optional[str] = Query(None, description="Search by ICD-10 code or description"),
    chapter: Optional[str] = Query(None, description="Filter by chapter letter e.g. 'M'"),
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=500),
):
    """
    Browse all distinct ICD-10 codes with descriptions.
    Merges covered and noncovered tables to provide a complete view.
    """
    try:
        with engine.connect() as conn:
            conditions = ["1=1"]
            params: dict = {"limit": page_size, "offset": (page - 1) * page_size}

            if search:
                s = search.strip()
                conditions.append(
                    "(code LIKE :search_upper OR LOWER(description) LIKE :search_lower)"
                )
                params["search_upper"] = f"%{s.upper()}%"
                params["search_lower"] = f"%{s.lower()}%"

            if chapter:
                conditions.append("code LIKE :chapter")
                params["chapter"] = f"{chapter.upper()}%"

            where = " AND ".join(conditions)

            base_cte = """
                WITH icd_raw AS (
                    (SELECT DISTINCT ON (icd10_code_id)
                           icd10_code_id AS code, description
                    FROM article_x_icd10_covered
                    WHERE description IS NOT NULL AND description != ''
                    ORDER BY icd10_code_id, article_version DESC)
                    UNION
                    (SELECT DISTINCT ON (icd10_code_id)
                           icd10_code_id AS code, description
                    FROM article_x_icd10_noncovered
                    WHERE description IS NOT NULL AND description != ''
                    ORDER BY icd10_code_id, article_version DESC)
                ),
                icd_dedup AS (
                    SELECT code, MAX(description) AS description
                    FROM icd_raw
                    GROUP BY code
                )
            """

            total = conn.execute(
                text(f"{base_cte} SELECT COUNT(*) FROM icd_dedup WHERE {where}"),
                params,
            ).scalar() or 0

            rows = conn.execute(
                text(f"""
                    {base_cte}
                    SELECT code, description
                    FROM icd_dedup
                    WHERE {where}
                    ORDER BY code
                    LIMIT :limit OFFSET :offset
                """),
                params,
            ).fetchall()

            # Chapter summary for nav
            chapters = []
            if page == 1 and not search:
                ch_rows = conn.execute(
                    text("""
                        WITH icd_raw AS (
                            SELECT DISTINCT icd10_code_id AS code FROM article_x_icd10_covered
                            UNION
                            SELECT DISTINCT icd10_code_id AS code FROM article_x_icd10_noncovered
                        )
                        SELECT LEFT(code, 1) AS ch, COUNT(*) AS cnt
                        FROM icd_raw
                        GROUP BY 1 ORDER BY 1
                    """),
                ).fetchall()
                chapters = [{"letter": r.ch, "count": r.cnt} for r in ch_rows]

            return {
                "total": total,
                "page": page,
                "pageSize": page_size,
                "totalPages": (total + page_size - 1) // page_size,
                "chapters": chapters,
                "rows": [
                    {"code": r.code, "description": r.description}
                    for r in rows
                ],
            }
    except Exception as e:
        return {"total": 0, "page": 1, "pageSize": page_size, "totalPages": 0, "chapters": [], "rows": [], "error": str(e)}


@router.get("/explorer/cpt")
async def explorer_cpt(
    search: Optional[str] = Query(None, description="Search by CPT code or description"),
    range_start: Optional[str] = Query(None, description="Start of code range e.g. '10000'"),
    range_end: Optional[str] = Query(None, description="End of code range e.g. '19999'"),
    status: Optional[str] = Query(None, description="Filter by status code e.g. 'A'"),
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=500),
):
    """
    Browse all CPT/HCPCS codes from the Physician Fee Schedule.
    Also includes HCPCS codes from LCD articles that aren't in PFS.
    """
    try:
        with engine.connect() as conn:
            conditions = ["1=1"]
            params: dict = {"limit": page_size, "offset": (page - 1) * page_size}

            if search:
                s = search.strip()
                conditions.append(
                    "(code LIKE :search_upper OR LOWER(description) LIKE :search_lower)"
                )
                params["search_upper"] = f"%{s.upper()}%"
                params["search_lower"] = f"%{s.lower()}%"

            if range_start:
                conditions.append("code >= :range_start")
                params["range_start"] = range_start.strip()
            if range_end:
                conditions.append("code <= :range_end")
                params["range_end"] = range_end.strip()
            if status:
                conditions.append("status_code = :status")
                params["status"] = status.strip().upper()

            where = " AND ".join(conditions)

            base_cte = """
                WITH cpt_all AS (
                    SELECT hcpcs AS code, description, status_code,
                           work_rvu, nonfac_pe_rvu, facility_pe_rvu, mp_rvu,
                           nonfac_total, facility_total, conv_factor
                    FROM pfs_rvu
                    WHERE modifier IS NULL
                    UNION ALL
                    SELECT * FROM (
                        SELECT DISTINCT ON (h.hcpc_code_id)
                               h.hcpc_code_id AS code,
                               COALESCE(h.long_description, h.short_description) AS description,
                               NULL::text AS status_code,
                               NULL::real AS work_rvu, NULL::real AS nonfac_pe_rvu,
                               NULL::real AS facility_pe_rvu, NULL::real AS mp_rvu,
                               NULL::real AS nonfac_total, NULL::real AS facility_total,
                               NULL::real AS conv_factor
                        FROM article_x_hcpc_code h
                        WHERE NOT EXISTS (
                            SELECT 1 FROM pfs_rvu p
                            WHERE p.hcpcs = h.hcpc_code_id AND p.modifier IS NULL
                        )
                        ORDER BY h.hcpc_code_id, h.article_version DESC
                    ) gap_fill
                ),
                cpt_dedup AS (
                    SELECT code,
                           MAX(description) FILTER (WHERE description IS NOT NULL AND description != '') AS description,
                           MAX(status_code) AS status_code,
                           MAX(work_rvu) AS work_rvu,
                           MAX(nonfac_pe_rvu) AS nonfac_pe_rvu,
                           MAX(facility_pe_rvu) AS facility_pe_rvu,
                           MAX(mp_rvu) AS mp_rvu,
                           MAX(nonfac_total) AS nonfac_total,
                           MAX(facility_total) AS facility_total,
                           MAX(conv_factor) AS conv_factor
                    FROM cpt_all
                    GROUP BY code
                )
            """

            total = conn.execute(
                text(f"{base_cte} SELECT COUNT(*) FROM cpt_dedup WHERE {where}"),
                params,
            ).scalar() or 0

            rows = conn.execute(
                text(f"""
                    {base_cte}
                    SELECT code, description, status_code,
                           work_rvu, nonfac_pe_rvu, facility_pe_rvu, mp_rvu,
                           nonfac_total, facility_total, conv_factor
                    FROM cpt_dedup
                    WHERE {where}
                    ORDER BY code
                    LIMIT :limit OFFSET :offset
                """),
                params,
            ).fetchall()

            # Code range summary for navigation
            ranges = []
            if page == 1 and not search and not range_start:
                rng_rows = conn.execute(
                    text(f"""
                        {base_cte}
                        SELECT
                            CASE
                                WHEN code ~ '^[0-9]{{5}}$' THEN
                                    LPAD(CAST(FLOOR(CAST(code AS INTEGER) / 10000) * 10000 AS TEXT), 5, '0')
                                ELSE LEFT(code, 1)
                            END AS range_key,
                            COUNT(*) AS cnt
                        FROM cpt_dedup
                        GROUP BY 1 ORDER BY 1
                    """),
                ).fetchall()
                ranges = [{"range": r.range_key, "count": r.cnt} for r in rng_rows]

            return {
                "total": total,
                "page": page,
                "pageSize": page_size,
                "totalPages": (total + page_size - 1) // page_size,
                "ranges": ranges,
                "rows": [
                    {
                        "code": r.code,
                        "description": r.description,
                        "statusCode": r.status_code,
                        "workRvu": r.work_rvu,
                        "nonfacPeRvu": r.nonfac_pe_rvu,
                        "facilityPeRvu": r.facility_pe_rvu,
                        "mpRvu": r.mp_rvu,
                        "nonfacTotal": r.nonfac_total,
                        "facilityTotal": r.facility_total,
                        "convFactor": r.conv_factor,
                    }
                    for r in rows
                ],
            }
    except Exception as e:
        return {"total": 0, "page": 1, "pageSize": page_size, "totalPages": 0, "ranges": [], "rows": [], "error": str(e)}