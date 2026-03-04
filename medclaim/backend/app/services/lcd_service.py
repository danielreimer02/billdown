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
       → article_x_icd10_covered_group (group rules: standalone / combination)
       → lcd_related_documents → lcd (get LCD title)
"""

import logging
import re
from dataclasses import dataclass, field
from html import unescape

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

# ALL noncovered ICD-10 codes for a CPT in a state
ALL_NONCOVERED_FOR_CPT_QUERY = text("""
    SELECT DISTINCT
        nc.icd10_code_id AS code,
        nc.description
    FROM article_x_hcpc_code h
    JOIN article_x_icd10_noncovered nc
        ON nc.article_id = h.article_id
        AND nc.article_version = h.article_version
    JOIN article a
        ON a.article_id = h.article_id
        AND a.article_version = h.article_version
    JOIN article_x_contractor ac
        ON ac.article_id = a.article_id
        AND ac.article_version = a.article_version
    JOIN contractor_jurisdiction cj
        ON cj.contractor_id = ac.contractor_id
    JOIN state_lookup sl
        ON sl.state_id = cj.state_id
    WHERE h.hcpc_code_id = :cpt_code
      AND sl.state_abbrev IN :states
    ORDER BY nc.icd10_code_id
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


# ─────────────────────────────────────────
# PHYSICIAN HELPER: all covered ICDs for a CPT + state
# WITH GROUP / COMBINATION LOGIC
# ─────────────────────────────────────────

# Query to get group metadata for an article
GROUP_META_QUERY = text("""
    SELECT icd10_covered_group AS group_num, paragraph
    FROM article_x_icd10_covered_group
    WHERE article_id = :article_id
      AND article_version = :article_version
    ORDER BY icd10_covered_group
""")

# ALL covered codes WITH their group number
ALL_COVERED_WITH_GROUP_QUERY = text("""
    SELECT DISTINCT
        cov.icd10_code_id AS code,
        cov.description,
        cov.icd10_covered_group AS group_num,
        l.lcd_id,
        l.title AS lcd_title,
        a.article_id,
        a.article_version,
        a.title AS article_title
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
      AND sl.state_abbrev IN :states
    ORDER BY cov.icd10_covered_group, cov.icd10_code_id
""")


def _strip_html(s: str) -> str:
    """Strip HTML tags and decode entities from a paragraph."""
    if not s:
        return ""
    clean = re.sub(r"<[^>]+>", " ", s)
    clean = unescape(clean)
    clean = re.sub(r"\s+", " ", clean).strip()
    return clean


def _is_xx000_placeholder(code: str) -> bool:
    """Return True for wildcard placeholder codes like XX000, XX001, etc."""
    return bool(re.match(r"^XX\d{3}$", code, re.IGNORECASE))


def _parse_group_rule(paragraph: str) -> dict:
    """
    Parse a SINGLE group paragraph to determine its rule type.
    Used as a building block by _classify_article_groups().

    Returns:
        {
            "type": "standalone" | "combination" | "per_cpt" | "informational",
            "requires_groups": [int, ...],   # group numbers required together
            "paragraph_text": str,           # cleaned text
        }
    """
    clean = _strip_html(paragraph)
    lower = clean.lower()

    # "stand-alone" → these codes work on their own
    if "stand-alone" in lower or "stand alone" in lower or "standalone" in lower:
        return {
            "type": "standalone",
            "requires_groups": [],
            "paragraph_text": clean,
        }

    # Explicit "Group X and Group Y must be billed" / "one from Group X"
    combo_pattern = r"group\s+(\d+)\s+and\s+(?:one\s+from\s+)?group\s+(\d+)"
    match = re.search(combo_pattern, lower)
    if match:
        g1, g2 = int(match.group(1)), int(match.group(2))
        return {
            "type": "combination",
            "requires_groups": [g1, g2],
            "paragraph_text": clean,
        }

    # "1 code from both Group X and Group Y"
    both_pattern = r"(?:1|one)\s+code\s+from\s+both\s+group\s+(\d+)\s+and\s+group\s+(\d+)"
    match = re.search(both_pattern, lower)
    if match:
        g1, g2 = int(match.group(1)), int(match.group(2))
        return {
            "type": "combination",
            "requires_groups": [g1, g2],
            "paragraph_text": clean,
        }

    # "and at least one of the following" → combo with previous group
    if "and at least one of the following" in lower:
        return {
            "type": "combination",
            "requires_groups": [],  # caller resolves from context
            "paragraph_text": clean,
        }

    # Per-CPT / per-drug group: paragraph starts with drug name or CPT reference
    per_cpt = re.match(
        r"^(?:for\s+(?:cpt|hcpcs|hcpc)\s|for\s+[a-z][\w\-]*\s*:|"
        r"hcpcs\s+code[s]?\s|cpt\s+code[s]?\s)",
        lower,
    )
    if per_cpt:
        return {
            "type": "per_cpt",
            "requires_groups": [],
            "paragraph_text": clean,
        }

    # Fallback — informational / context paragraph
    return {
        "type": "informational",
        "requires_groups": [],
        "paragraph_text": clean,
    }


def _classify_article_groups(
    group_meta: dict[int, dict],
) -> dict:
    """
    Article-level classifier that sees ALL group paragraphs at once.

    Returns:
        {
            "standalone_groups": set[int],     # groups whose codes work alone
            "combination_sets": list[set[int]], # groups that must be billed together
        }

    Rules:
    1. Explicit "stand-alone" → standalone
    2. Explicit "Group X and Group Y" → combo set
    3. Partner groups of a combo (mentioned by another group) → part of that set
    4. Per-CPT / per-drug groups → all standalone
    5. Primary/Secondary pattern → combo sets
    6. "and at least one of the following" → combo with previous group
    7. Default → standalone  (safe — 283 of 336 multi-group articles are standalone)
    """
    all_groups = set(group_meta.keys())
    standalone: set[int] = set()
    combo_sets: list[set[int]] = []
    classified: set[int] = set()

    # ── Pass 1: scan each group's own rule ──
    for gn, meta in group_meta.items():
        rt = meta["type"]

        if rt == "standalone":
            standalone.add(gn)
            classified.add(gn)

        elif rt == "combination" and meta["requires_groups"]:
            pair = set(meta["requires_groups"])
            # Merge into existing set if overlapping
            merged = False
            for cs in combo_sets:
                if cs & pair:
                    cs |= pair
                    merged = True
                    break
            if not merged:
                combo_sets.append(pair)
            classified |= pair

        elif rt == "per_cpt":
            standalone.add(gn)
            classified.add(gn)

    # ── Pass 2: "and at least one of the following" with no explicit groups ──
    for gn, meta in group_meta.items():
        if gn in classified:
            continue
        lower = meta["paragraph_text"].lower()
        if "and at least one of the following" in lower:
            prev = gn - 1
            if prev in all_groups:
                combo_sets.append({prev, gn})
                classified.add(gn)
                classified.add(prev)
                # Remove prev from standalone if it was there
                standalone.discard(prev)

    # ── Pass 3: Primary / Secondary pattern ──
    unclassified = all_groups - classified
    if unclassified and len(all_groups) >= 2:
        g1_meta = group_meta.get(min(all_groups))
        if g1_meta:
            g1_lower = g1_meta["paragraph_text"].lower()
            if "primary" in g1_lower and ("diagnos" in g1_lower or "icd" in g1_lower):
                # Check if any other group says "secondary" or "must also include"
                secondary_groups = []
                for gn in sorted(unclassified):
                    if gn == min(all_groups):
                        continue
                    m = group_meta.get(gn, {})
                    p = m.get("paragraph_text", "").lower()
                    if "secondary" in p or "must also include" in p:
                        secondary_groups.append(gn)

                if secondary_groups:
                    primary_g = min(all_groups)
                    for sg in secondary_groups:
                        combo_sets.append({primary_g, sg})
                        classified.add(sg)
                    classified.add(primary_g)
                    standalone.discard(primary_g)

    # ── Pass 4: everything still unclassified → standalone ──
    for gn in all_groups - classified:
        standalone.add(gn)

    return {
        "standalone_groups": standalone,
        "combination_sets": combo_sets,
    }


@dataclass
class GroupInfo:
    group_num: int
    rule_type: str            # "standalone" | "combination" | "informational"
    requires_groups: list[int]
    paragraph: str
    codes: list[dict]         # [{"code": "M17.11", "description": "..."}]


@dataclass
class CoveredCodesResult:
    cpt_code: str
    state: str
    lcd_id: str | None
    lcd_title: str | None
    article_id: str | None
    article_title: str | None
    groups: list[dict]            # structured group info
    standalone_codes: list[dict]  # codes that work alone
    combination_groups: list[dict]  # groups that must be paired
    noncovered_codes: list[dict]
    xx000_message: str | None     # message when XX000 placeholders found


def lookup_covered_codes(cpt_code: str, state: str) -> CoveredCodesResult | None:
    """
    Return ALL covered and noncovered ICD-10 codes for a CPT in a state,
    organized by group with standalone/combination rules.

    Group logic:
    - "stand-alone" groups → codes work independently
    - "Group X and Group Y" → must bill codes from both groups together
    - XX000 placeholder codes are filtered out with a warning message
    """
    states = tuple(_state_abbrevs(state))

    try:
        with engine.connect() as conn:
            # 1. Get all covered codes with their group numbers
            covered_rows = conn.execute(
                ALL_COVERED_WITH_GROUP_QUERY,
                {"cpt_code": cpt_code, "states": states},
            ).fetchall()

            noncovered_rows = conn.execute(
                ALL_NONCOVERED_FOR_CPT_QUERY,
                {"cpt_code": cpt_code, "states": states},
            ).fetchall()

            if not covered_rows and not noncovered_rows:
                return None

            # Get LCD/article info from first row
            lcd_id = str(covered_rows[0].lcd_id) if covered_rows else None
            lcd_title = covered_rows[0].lcd_title if covered_rows else None
            article_id = str(covered_rows[0].article_id) if covered_rows else None
            article_version = covered_rows[0].article_version if covered_rows else None
            article_title = covered_rows[0].article_title if covered_rows else None

            # 2. Get group metadata paragraphs and classify at article level
            group_meta: dict[int, dict] = {}
            if article_id and article_version:
                meta_rows = conn.execute(
                    GROUP_META_QUERY,
                    {"article_id": int(article_id), "article_version": article_version},
                ).fetchall()

                for mrow in meta_rows:
                    parsed = _parse_group_rule(mrow.paragraph or "")
                    group_meta[mrow.group_num] = parsed

            # Article-level classification (sees all groups at once)
            classification = _classify_article_groups(group_meta)
            standalone_group_nums = classification["standalone_groups"]
            combo_sets = classification["combination_sets"]

            # 3. Organize codes by group
            codes_by_group: dict[int, list[dict]] = {}
            has_xx000 = False

            for r in covered_rows:
                gn = r.group_num or 0
                code = r.code

                if _is_xx000_placeholder(code):
                    has_xx000 = True
                    continue  # filter out XX000 placeholders

                if gn not in codes_by_group:
                    codes_by_group[gn] = []
                codes_by_group[gn].append({
                    "code": code,
                    "description": r.description or "",
                })

            # 4. Build structured groups using article-level classification
            groups = []
            standalone_codes: list[dict] = []
            combination_groups: list[dict] = []
            combo_groups_emitted: set[tuple] = set()

            for gn in sorted(codes_by_group.keys()):
                meta = group_meta.get(gn, {
                    "type": "standalone",
                    "requires_groups": [],
                    "paragraph_text": "",
                })

                # Determine this group's effective role
                is_standalone = gn in standalone_group_nums
                combo_partners: list[int] = []
                for cs in combo_sets:
                    if gn in cs:
                        combo_partners = sorted(cs)
                        break

                effective_type = "standalone" if is_standalone else (
                    "combination" if combo_partners else "standalone"
                )

                group_info = {
                    "groupNum": gn,
                    "ruleType": effective_type,
                    "requiresGroups": [g for g in combo_partners if g != gn] if combo_partners else [],
                    "paragraph": meta.get("paragraph_text", ""),
                    "codes": codes_by_group[gn],
                }
                groups.append(group_info)

                if is_standalone:
                    standalone_codes.extend(codes_by_group[gn])
                elif combo_partners:
                    # Only emit a combo group once per set (keyed on the first member)
                    set_key = tuple(sorted(combo_partners))
                    if set_key not in combo_groups_emitted:
                        combo_groups_emitted.add(set_key)
                        combination_groups.append(group_info)
                else:
                    # No classification info at all — default to standalone
                    standalone_codes.extend(codes_by_group[gn])

            # Filter noncovered XX000 codes too
            clean_noncovered = [
                {"code": r.code, "description": r.description or ""}
                for r in noncovered_rows
                if not _is_xx000_placeholder(r.code)
            ]

            xx000_msg = None
            if has_xx000:
                xx000_msg = (
                    "Some placeholder codes (XX000-series) were found in the CMS data. "
                    "These are generic category placeholders, not real ICD-10 codes. "
                    "They've been filtered out — use the specific codes listed instead."
                )

            return CoveredCodesResult(
                cpt_code=cpt_code,
                state=state,
                lcd_id=lcd_id,
                lcd_title=lcd_title,
                article_id=article_id,
                article_title=article_title,
                groups=groups,
                standalone_codes=standalone_codes,
                combination_groups=combination_groups,
                noncovered_codes=clean_noncovered,
                xx000_message=xx000_msg,
            )

    except Exception as e:
        logger.warning(f"Covered codes lookup failed: {e}")
        return None


# ─────────────────────────────────────────
# REVERSE LOOKUP: ICD-10 → all CPTs that accept it
# (with standalone flag from group metadata)
# ─────────────────────────────────────────

# Reverse lookup query — now includes group info
CPTS_FOR_DIAGNOSIS_QUERY_V2 = text("""
    SELECT DISTINCT
        h.hcpc_code_id AS cpt_code,
        cov.icd10_covered_group AS group_num,
        l.lcd_id,
        l.title AS lcd_title,
        a.article_id,
        a.article_version,
        a.title AS article_title
    FROM article_x_icd10_covered cov
    JOIN article_x_hcpc_code h
        ON h.article_id = cov.article_id
        AND h.article_version = cov.article_version
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
    WHERE cov.icd10_code_id = :icd10_code
      AND sl.state_abbrev IN :states
    ORDER BY h.hcpc_code_id
""")


@dataclass
class CPTsForDiagnosisResult:
    icd10_code: str
    state: str
    cpts: list[dict]  # includes standalone flag now


def lookup_cpts_for_diagnosis(icd10_code: str, state: str) -> CPTsForDiagnosisResult | None:
    """
    Reverse lookup: given an ICD-10 + state, find ALL CPT codes that list this
    diagnosis as covered.  Now also checks group metadata to report whether
    the diagnosis code is standalone or requires a combination.
    """
    states = tuple(_state_abbrevs(state))

    try:
        with engine.connect() as conn:
            rows = conn.execute(
                CPTS_FOR_DIAGNOSIS_QUERY_V2,
                {"icd10_code": icd10_code, "states": states},
            ).fetchall()

            if not rows:
                return None

            # For each CPT, check if the diagnosis code's group is standalone
            # Cache article-level classification per (article_id, article_version)
            classification_cache: dict[tuple, dict] = {}
            group_meta_cache: dict[tuple, dict[int, dict]] = {}
            cpts = []

            for r in rows:
                art_key = (r.article_id, r.article_version)
                if art_key not in classification_cache:
                    meta_rows = conn.execute(
                        GROUP_META_QUERY,
                        {"article_id": r.article_id, "article_version": r.article_version},
                    ).fetchall()
                    meta = {
                        mr.group_num: _parse_group_rule(mr.paragraph or "")
                        for mr in meta_rows
                    }
                    group_meta_cache[art_key] = meta
                    classification_cache[art_key] = _classify_article_groups(meta)

                clf = classification_cache[art_key]
                is_standalone = r.group_num in clf["standalone_groups"]

                # Find combo partners if any
                requires = []
                for cs in clf["combination_sets"]:
                    if r.group_num in cs:
                        requires = sorted(g for g in cs if g != r.group_num)
                        break

                cpts.append({
                    "cptCode": r.cpt_code,
                    "lcdId": str(r.lcd_id) if r.lcd_id else None,
                    "lcdTitle": r.lcd_title,
                    "articleId": str(r.article_id) if r.article_id else None,
                    "articleTitle": r.article_title,
                    "standalone": is_standalone,
                    "groupNum": r.group_num,
                    "ruleType": "standalone" if is_standalone else ("combination" if requires else "standalone"),
                    "requiresGroups": requires,
                })

            return CPTsForDiagnosisResult(
                icd10_code=icd10_code,
                state=state,
                cpts=cpts,
            )

    except Exception as e:
        logger.warning(f"CPTs for diagnosis lookup failed: {e}")
        return None
