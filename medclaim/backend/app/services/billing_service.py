"""
Bill analysis service — the core pipeline.

Takes a list of bill line items and checks:
  1. NCCI PTP  → are any CPT pairs bundled? (unbundling fraud)
  2. MUE       → are any CPTs billed too many units? (quantity fraud)
  3. PFS       → are any charges way above Medicare rate? (price gouging)

Single entry point: analyze_bill()
Also exposes individual checkers for the debug/LCD lookup page.
"""

import logging
from dataclasses import dataclass, field
from datetime import date

from sqlalchemy import text
from app.db.session import engine

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────
# DATA TYPES
# ─────────────────────────────────────────

@dataclass
class BillLine:
    """A single line item from a medical bill."""
    cpt_code: str
    units: int = 1
    charge: float = 0.0
    description: str = ""


@dataclass
class BundlingFlag:
    """Two CPTs on the same bill that shouldn't be billed together."""
    cpt1: str
    cpt2: str
    setting: str            # "practitioner" or "hospital"
    modifier_ind: str       # 0=never, 1=modifier allowed, 9=n/a
    rationale: str
    detail: str             # human-readable explanation


@dataclass
class MueFlag:
    """A CPT billed more units than Medicare allows."""
    cpt_code: str
    billed_units: int
    max_units: int
    setting: str
    mai: str                # 1=line, 2=absolute, 3=date-of-service
    detail: str


@dataclass
class PriceFlag:
    """A CPT charged significantly above Medicare rate."""
    cpt_code: str
    charged: float
    medicare_rate: float
    ratio: float            # charged / medicare_rate
    detail: str


@dataclass
class BillAnalysisResult:
    """Full analysis of a medical bill."""
    bundling_flags: list[BundlingFlag] = field(default_factory=list)
    mue_flags: list[MueFlag] = field(default_factory=list)
    price_flags: list[PriceFlag] = field(default_factory=list)
    total_overcharge_estimate: float = 0.0
    summary: str = ""


# ─────────────────────────────────────────
# NCCI PTP — BUNDLING CHECK
# ─────────────────────────────────────────

# Check if a pair of CPTs is bundled
PTP_PAIR_QUERY = text("""
    SELECT column1_cpt, column2_cpt, setting, modifier_ind, rationale
    FROM ncci_ptp
    WHERE (
        (column1_cpt = :cpt1 AND column2_cpt = :cpt2)
        OR
        (column1_cpt = :cpt2 AND column2_cpt = :cpt1)
    )
    AND (deletion_date IS NULL OR deletion_date > CURRENT_DATE)
    LIMIT 2
""")

# Batch check: given a list of CPTs, find all bundled pairs
PTP_BATCH_QUERY = text("""
    SELECT DISTINCT column1_cpt, column2_cpt, setting, modifier_ind, rationale
    FROM ncci_ptp
    WHERE column1_cpt IN :cpts
      AND column2_cpt IN :cpts
      AND (deletion_date IS NULL OR deletion_date > CURRENT_DATE)
""")


def check_bundling_pair(cpt1: str, cpt2: str) -> list[BundlingFlag]:
    """Check if two specific CPTs are bundled. For manual/debug use."""
    try:
        with engine.connect() as conn:
            rows = conn.execute(PTP_PAIR_QUERY, {"cpt1": cpt1, "cpt2": cpt2}).fetchall()
            return [
                BundlingFlag(
                    cpt1=r.column1_cpt,
                    cpt2=r.column2_cpt,
                    setting=r.setting,
                    modifier_ind=r.modifier_ind or "",
                    rationale=r.rationale or "",
                    detail=(
                        f"CPT {r.column1_cpt} includes {r.column2_cpt} — "
                        f"billing both is {'never' if r.modifier_ind == '0' else 'sometimes'} allowed "
                        f"({r.setting}). {r.rationale or ''}"
                    ),
                )
                for r in rows
            ]
    except Exception as e:
        logger.warning(f"PTP pair check failed: {e}")
        return []


def check_bundling_batch(cpt_codes: list[str]) -> list[BundlingFlag]:
    """Check all pairs from a bill for bundling. One query."""
    if len(cpt_codes) < 2:
        return []

    try:
        cpt_tuple = tuple(set(cpt_codes))
        with engine.connect() as conn:
            rows = conn.execute(PTP_BATCH_QUERY, {"cpts": cpt_tuple}).fetchall()
            return [
                BundlingFlag(
                    cpt1=r.column1_cpt,
                    cpt2=r.column2_cpt,
                    setting=r.setting,
                    modifier_ind=r.modifier_ind or "",
                    rationale=r.rationale or "",
                    detail=(
                        f"CPT {r.column1_cpt} includes {r.column2_cpt} — "
                        f"billing both is {'never' if r.modifier_ind == '0' else 'sometimes'} allowed "
                        f"({r.setting}). {r.rationale or ''}"
                    ),
                )
                for r in rows
            ]
    except Exception as e:
        logger.warning(f"PTP batch check failed: {e}")
        return []


# ─────────────────────────────────────────
# MUE — QUANTITY CHECK
# ─────────────────────────────────────────

MUE_BATCH_QUERY = text("""
    SELECT cpt_code, mue_value, setting, mai, rationale
    FROM ncci_mue
    WHERE cpt_code IN :cpts
""")

MUE_SINGLE_QUERY = text("""
    SELECT cpt_code, mue_value, setting, mai, rationale
    FROM ncci_mue
    WHERE cpt_code = :cpt_code
""")


def check_mue_single(cpt_code: str) -> list[dict]:
    """Get MUE limit for a single CPT. For manual/debug use."""
    try:
        with engine.connect() as conn:
            rows = conn.execute(MUE_SINGLE_QUERY, {"cpt_code": cpt_code}).fetchall()
            return [
                {
                    "cptCode": r.cpt_code,
                    "mueValue": r.mue_value,
                    "setting": r.setting,
                    "mai": r.mai,
                    "rationale": r.rationale,
                }
                for r in rows
            ]
    except Exception as e:
        logger.warning(f"MUE single check failed: {e}")
        return []


def check_mue_batch(lines: list[BillLine]) -> list[MueFlag]:
    """Check all bill lines against MUE limits. One query."""
    cpt_codes = tuple(set(l.cpt_code for l in lines))
    if not cpt_codes:
        return []

    try:
        with engine.connect() as conn:
            rows = conn.execute(MUE_BATCH_QUERY, {"cpts": cpt_codes}).fetchall()

            # Build lookup: cpt → min MUE value across settings
            mue_map: dict[str, int] = {}
            mue_detail: dict[str, tuple] = {}
            for r in rows:
                existing = mue_map.get(r.cpt_code)
                if existing is None or r.mue_value < existing:
                    mue_map[r.cpt_code] = r.mue_value
                    mue_detail[r.cpt_code] = (r.setting, r.mai or "", r.rationale or "")

            flags = []
            for line in lines:
                limit = mue_map.get(line.cpt_code)
                if limit is not None and line.units > limit:
                    setting, mai, rationale = mue_detail.get(line.cpt_code, ("", "", ""))
                    detail = (
                        f"CPT {line.cpt_code}: billed {line.units} units, "
                        f"MUE limit is {limit} per day. "
                        f"{_mai_explanation(mai)}"
                    )
                    flags.append(MueFlag(
                        cpt_code=line.cpt_code,
                        billed_units=line.units,
                        max_units=limit,
                        setting=setting,
                        mai=mai,
                        detail=detail.strip(),
                    ))
            return flags

    except Exception as e:
        logger.warning(f"MUE batch check failed: {e}")
        return []


def _mai_explanation(mai: str) -> str:
    """
    MAI = MUE Adjudication Indicator.
      1 = Line Edit: Anatomically impossible to exceed.
      2 = Date-of-Service Edit: Possible but needs documentation.
      3 = Policy Edit: CMS guideline-based; clinical justification may exist.
    """
    mai = (mai or "").strip()
    if mai == "1":
        return "Exceeds what is anatomically possible for this procedure."
    elif mai == "2":
        return (
            "May be legitimate across separate encounters. "
            "Provider may have documentation to support units billed."
        )
    elif mai == "3":
        return (
            "Exceeds CMS policy limit. "
            "Provider may have clinical justification for additional units."
        )
    return ""


# ─────────────────────────────────────────
# PFS — PRICE CHECK (RVU + GPCI based)
# ─────────────────────────────────────────

# 2026 CMS Conversion Factor
CMS_CF = 33.4009

# Get national RVU totals for CPTs (no GPCI adjustment)
PFS_NATIONAL_QUERY = text("""
    SELECT hcpcs, nonfac_total, facility_total, conv_factor, description
    FROM pfs_rvu
    WHERE hcpcs IN :cpts
      AND modifier IS NULL
      AND nonfac_total > 0
""")

# Get GPCI for a state (first matching locality)
GPCI_QUERY = text("""
    SELECT state, locality_name, pw_gpci, pe_gpci, mp_gpci
    FROM gpci_locality
    WHERE state = :state
    LIMIT 1
""")

# Get all localities for a state
LOCALITIES_QUERY = text("""
    SELECT locality_number, locality_name, counties, pw_gpci, pe_gpci, mp_gpci
    FROM gpci_locality
    WHERE state = :state
    ORDER BY locality_number
""")

# Get RVU components + GPCI for locality-adjusted pricing
# If locality_number is provided, use exact match; otherwise first match for state
PFS_LOCAL_QUERY = text("""
    SELECT r.hcpcs, r.work_rvu, r.nonfac_pe_rvu, r.facility_pe_rvu, r.mp_rvu,
           r.nonfac_total, r.facility_total, r.conv_factor, r.description,
           g.pw_gpci, g.pe_gpci, g.mp_gpci, g.locality_name, g.locality_number
    FROM pfs_rvu r
    CROSS JOIN gpci_locality g
    WHERE r.hcpcs = :hcpcs
      AND r.modifier IS NULL
      AND g.state = :state
    LIMIT 1
""")

PFS_LOCAL_QUERY_WITH_LOCALITY = text("""
    SELECT r.hcpcs, r.work_rvu, r.nonfac_pe_rvu, r.facility_pe_rvu, r.mp_rvu,
           r.nonfac_total, r.facility_total, r.conv_factor, r.description,
           g.pw_gpci, g.pe_gpci, g.mp_gpci, g.locality_name, g.locality_number
    FROM pfs_rvu r
    CROSS JOIN gpci_locality g
    WHERE r.hcpcs = :hcpcs
      AND r.modifier IS NULL
      AND g.state = :state
      AND g.locality_number = :locality
    LIMIT 1
""")

# Price threshold — flag if charged more than this multiple of Medicare rate
PRICE_FLAG_THRESHOLD = 2.0


def get_localities(state: str) -> list[dict]:
    """Return all GPCI localities for a state."""
    try:
        with engine.connect() as conn:
            rows = conn.execute(LOCALITIES_QUERY, {"state": state.upper()}).fetchall()
            return [
                {
                    "localityNumber": r.locality_number,
                    "localityName": r.locality_name,
                    "counties": r.counties or "",
                    "pwGpci": r.pw_gpci,
                    "peGpci": r.pe_gpci,
                    "mpGpci": r.mp_gpci,
                }
                for r in rows
            ]
    except Exception as e:
        logger.warning(f"Localities lookup failed: {e}")
        return []


def _compute_payment(work_rvu: float, pe_rvu: float, mp_rvu: float,
                     pw_gpci: float, pe_gpci: float, mp_gpci: float,
                     cf: float) -> float:
    """
    CMS payment formula:
    Payment = (Work_RVU × PW_GPCI + PE_RVU × PE_GPCI + MP_RVU × MP_GPCI) × CF
    """
    return (work_rvu * pw_gpci + pe_rvu * pe_gpci + mp_rvu * mp_gpci) * cf


def check_price_single(
    cpt_code: str,
    state: str | None = None,
    locality: str | None = None,
    setting: str = "nonfacility",
) -> dict | None:
    """Get Medicare rate for a single CPT. For manual/debug use."""
    try:
        with engine.connect() as conn:
            # If state provided, do GPCI-adjusted lookup
            if state:
                if locality:
                    row = conn.execute(PFS_LOCAL_QUERY_WITH_LOCALITY, {
                        "hcpcs": cpt_code, "state": state.upper(),
                        "locality": locality,
                    }).first()
                else:
                    row = conn.execute(PFS_LOCAL_QUERY, {
                        "hcpcs": cpt_code, "state": state.upper(),
                    }).first()
                if row:
                    pe_rvu = row.nonfac_pe_rvu if setting == "nonfacility" else row.facility_pe_rvu
                    payment = _compute_payment(
                        row.work_rvu, pe_rvu, row.mp_rvu,
                        row.pw_gpci, row.pe_gpci, row.mp_gpci,
                        row.conv_factor or CMS_CF,
                    )
                    return {
                        "cptCode": row.hcpcs,
                        "description": row.description,
                        "payment": round(payment, 2),
                        "workRvu": row.work_rvu,
                        "peRvu": pe_rvu,
                        "mpRvu": row.mp_rvu,
                        "gpci": {
                            "pw": row.pw_gpci,
                            "pe": row.pe_gpci,
                            "mp": row.mp_gpci,
                        },
                        "locality": row.locality_name,
                        "convFactor": row.conv_factor or CMS_CF,
                        "source": "gpci_adjusted",
                    }

            # Fall back to national (no GPCI, use raw total RVU × CF)
            row = conn.execute(
                text("""
                    SELECT hcpcs, nonfac_total, facility_total, conv_factor, description
                    FROM pfs_rvu
                    WHERE hcpcs = :hcpcs AND modifier IS NULL AND nonfac_total > 0
                    LIMIT 1
                """),
                {"hcpcs": cpt_code},
            ).first()
            if row:
                total = row.nonfac_total if setting == "nonfacility" else row.facility_total
                cf = row.conv_factor or CMS_CF
                payment = total * cf
                return {
                    "cptCode": row.hcpcs,
                    "description": row.description,
                    "payment": round(payment, 2),
                    "totalRvu": total,
                    "convFactor": cf,
                    "source": "national",
                }
            return None
    except Exception as e:
        logger.warning(f"PFS price check failed: {e}")
        return None


def check_prices_batch(
    lines: list[BillLine],
    state: str = "",
    setting: str = "hospital",
    threshold: float = PRICE_FLAG_THRESHOLD,
) -> list[PriceFlag]:
    """Check all bill lines against Medicare rates. One query for RVUs, one for GPCI."""
    cpt_codes = tuple(set(l.cpt_code for l in lines))
    if not cpt_codes:
        return []

    try:
        with engine.connect() as conn:
            # Get RVUs for all CPTs
            rows = conn.execute(PFS_NATIONAL_QUERY, {"cpts": cpt_codes}).fetchall()
            rvu_map = {}
            for r in rows:
                use_facility = setting in ("hospital", "facility")
                total = r.facility_total if use_facility else r.nonfac_total
                cf = r.conv_factor or CMS_CF
                rvu_map[r.hcpcs] = (total, cf)

            # Get GPCI multiplier if state provided
            gpci_mult = 1.0  # default: no locality adjustment
            if state:
                gpci_row = conn.execute(GPCI_QUERY, {"state": state.upper()}).first()
                if gpci_row:
                    # Simplified: use average of the 3 GPCIs as overall multiplier
                    # More accurate would be per-component, but this is close enough
                    # for flagging purposes (overcharge detection, not payment calc)
                    gpci_mult = (gpci_row.pw_gpci + gpci_row.pe_gpci + gpci_row.mp_gpci) / 3.0

            # Build rate map: CPT → estimated Medicare payment
            rate_map = {}
            for hcpcs, (total_rvu, cf) in rvu_map.items():
                rate_map[hcpcs] = total_rvu * cf * gpci_mult

            flags = []
            for line in lines:
                rate = rate_map.get(line.cpt_code)
                if rate and rate > 0 and line.charge > 0:
                    ratio = line.charge / rate
                    if ratio >= threshold:
                        flags.append(PriceFlag(
                            cpt_code=line.cpt_code,
                            charged=line.charge,
                            medicare_rate=round(rate, 2),
                            ratio=round(ratio, 1),
                            detail=(
                                f"CPT {line.cpt_code}: charged ${line.charge:,.2f}, "
                                f"Medicare rate is ~${rate:,.2f} "
                                f"({ratio:.1f}x markup)"
                            ),
                        ))
            return flags

    except Exception as e:
        logger.warning(f"PFS price batch check failed: {e}")
        return []


# ─────────────────────────────────────────
# MAIN PIPELINE
# ─────────────────────────────────────────

def analyze_bill(
    lines: list[BillLine],
    state: str = "",
    setting: str = "hospital",
    price_threshold: float = PRICE_FLAG_THRESHOLD,
) -> BillAnalysisResult:
    """
    Full bill analysis pipeline. One call, one response.

    1. NCCI PTP  → check all CPT pairs for bundling
    2. MUE       → check all CPTs for unit limits
    3. PFS       → check all charges vs Medicare rates

    Returns BillAnalysisResult with all flags + estimated overcharge.
    """
    result = BillAnalysisResult()

    # 1. Bundling check
    cpt_codes = [l.cpt_code for l in lines]
    result.bundling_flags = check_bundling_batch(cpt_codes)

    # 2. MUE check
    result.mue_flags = check_mue_batch(lines)

    # 3. Price check
    result.price_flags = check_prices_batch(
        lines, state=state, setting=setting, threshold=price_threshold,
    )

    # Estimate total overcharge
    overcharge = 0.0

    # Bundled items: the smaller CPT's charge is the overcharge
    bundled_cpts = set()
    for flag in result.bundling_flags:
        # Column 2 is the component (included) code — its charge is the overcharge
        bundled_cpts.add(flag.cpt2)
    for line in lines:
        if line.cpt_code in bundled_cpts:
            overcharge += line.charge

    # MUE violations: charge for excess units
    for flag in result.mue_flags:
        matching_line = next((l for l in lines if l.cpt_code == flag.cpt_code), None)
        if matching_line and matching_line.charge > 0:
            per_unit = matching_line.charge / matching_line.units
            excess_units = flag.billed_units - flag.max_units
            overcharge += per_unit * excess_units

    # Price flags: difference between charged and reasonable rate (3x Medicare)
    for flag in result.price_flags:
        reasonable = flag.medicare_rate * price_threshold
        if flag.charged > reasonable:
            overcharge += flag.charged - reasonable

    result.total_overcharge_estimate = round(overcharge, 2)

    # Summary
    total_flags = len(result.bundling_flags) + len(result.mue_flags) + len(result.price_flags)
    if total_flags == 0:
        result.summary = "No billing issues detected."
    else:
        parts = []
        if result.bundling_flags:
            parts.append(f"{len(result.bundling_flags)} bundling issue(s)")
        if result.mue_flags:
            parts.append(f"{len(result.mue_flags)} quantity issue(s)")
        if result.price_flags:
            parts.append(f"{len(result.price_flags)} pricing issue(s)")
        result.summary = (
            f"Found {total_flags} issue(s): {', '.join(parts)}. "
            f"Estimated overcharge: ${result.total_overcharge_estimate:,.2f}"
        )

    return result
