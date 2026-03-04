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

from app.services.billing_service import (
    BillLine,
    analyze_bill,
    check_bundling_pair,
    check_mue_single,
    check_price_single,
    get_localities,
)

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
