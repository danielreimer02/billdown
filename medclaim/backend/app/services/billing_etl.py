"""
ETL: Load NCCI PTP, MUE, and PFS data into Postgres.

Data sources:
  - PTP: Tab-delimited TXT files from CMS NCCI PTP edits download
    8 files: 4 practitioner (ccipra-*) + 4 hospital (ccioph-*)
  - MUE: CSV files from CMS NCCI MUE download
    2 files: 1 practitioner + 1 hospital
    Format: copyright header (multi-line), then header row, then data
  - PFS: Comma-delimited TXT from CMS Physician Fee Schedule

Strategy: TRUNCATE + reload (idempotent), same as lcd_etl.py.
"""

import csv
import logging
import os
import re
from datetime import date
from pathlib import Path

from sqlalchemy import text
from app.db.session import engine

logger = logging.getLogger(__name__)

BATCH_SIZE = 10000


# ─────────────────────────────────────────
# PTP ETL
# ─────────────────────────────────────────

def _parse_date(s: str) -> date | None:
    """Parse YYYYMMDD date string."""
    s = s.strip()
    if not s or len(s) != 8:
        return None
    try:
        return date(int(s[:4]), int(s[4:6]), int(s[6:8]))
    except (ValueError, IndexError):
        return None


def _is_header_line(line: str) -> bool:
    """Skip header/comment lines in PTP files."""
    stripped = line.strip()
    if not stripped:
        return True
    # Header lines start with text like "CPT only", "Column1", etc.
    if stripped.startswith("CPT ") or stripped.startswith("Column"):
        return True
    # Header lines contain descriptions like "prior to 1996"
    if "prior to 1996" in stripped or "not applicable" in stripped:
        return True
    if "=in existence" in stripped or "=no data" in stripped:
        return True
    return False


def _parse_ptp_line(line: str) -> dict | None:
    """
    Parse a single PTP data line.
    Format (tab-delimited):
      Column1_CPT  Column2_CPT  *_flag  Effective_Date  Deletion_Date  Modifier_Ind  Rationale
    """
    parts = line.split("\t")
    if len(parts) < 6:
        return None

    col1 = parts[0].strip()
    col2 = parts[1].strip()

    # Validate: both columns should look like CPT codes (alphanumeric, 4-5 chars)
    if not col1 or not col2:
        return None
    if not re.match(r"^[A-Za-z0-9]{4,6}$", col1):
        return None

    # parts[2] is the "*" flag (in existence prior to 1996), skip it
    eff_date = _parse_date(parts[3]) if len(parts) > 3 else None
    del_date = _parse_date(parts[4]) if len(parts) > 4 else None
    mod_ind = parts[5].strip() if len(parts) > 5 else None
    rationale = parts[6].strip() if len(parts) > 6 else None

    return {
        "column1_cpt": col1,
        "column2_cpt": col2,
        "effective_date": eff_date,
        "deletion_date": del_date,
        "modifier_ind": mod_ind,
        "rationale": rationale[:255] if rationale else None,
    }


def load_ptp_data(data_dir: str) -> dict:
    """
    Load all PTP files from data_dir into ncci_ptp table.
    Expects extracted TXT files: ccipra-*.txt/TXT and ccioph-*.txt/TXT
    """
    base = Path(data_dir)
    if not base.exists():
        logger.warning(f"PTP data directory not found: {data_dir}")
        return {"error": f"Directory not found: {data_dir}"}

    # Find all TXT files
    ptp_files = sorted(
        list(base.glob("ccipra-*.txt")) +
        list(base.glob("ccipra-*.TXT")) +
        list(base.glob("ccioph-*.txt")) +
        list(base.glob("ccioph-*.TXT"))
    )

    if not ptp_files:
        logger.warning(f"No PTP files found in {data_dir}")
        return {"error": "No PTP files found"}

    logger.info(f"Found {len(ptp_files)} PTP files to load")

    total_loaded = 0
    summary = {}

    with engine.begin() as conn:
        # Truncate once
        conn.execute(text("TRUNCATE TABLE ncci_ptp"))

        for filepath in ptp_files:
            fname = filepath.name.lower()
            setting = "practitioner" if "ccipra" in fname else "hospital"

            rows_loaded = 0
            batch = []

            with open(filepath, "r", encoding="latin-1") as f:
                for line in f:
                    if _is_header_line(line):
                        continue

                    parsed = _parse_ptp_line(line)
                    if not parsed:
                        continue

                    parsed["setting"] = setting
                    batch.append(parsed)

                    if len(batch) >= BATCH_SIZE:
                        _insert_ptp_batch(conn, batch)
                        rows_loaded += len(batch)
                        batch = []

                if batch:
                    _insert_ptp_batch(conn, batch)
                    rows_loaded += len(batch)

            logger.info(f"  → {filepath.name}: {rows_loaded:,} rows ({setting})")
            summary[filepath.name] = rows_loaded
            total_loaded += rows_loaded

    logger.info(f"PTP ETL complete — {total_loaded:,} total rows")
    summary["total"] = total_loaded
    return summary


def _insert_ptp_batch(conn, batch: list[dict]):
    """Bulk insert PTP rows."""
    stmt = text("""
        INSERT INTO ncci_ptp
            (setting, column1_cpt, column2_cpt, effective_date, deletion_date, modifier_ind, rationale)
        VALUES
            (:setting, :column1_cpt, :column2_cpt, :effective_date, :deletion_date, :modifier_ind, :rationale)
    """)
    conn.execute(stmt, batch)


# ─────────────────────────────────────────
# MUE ETL — CSV format with copyright header
# ─────────────────────────────────────────

def _extract_mai_digit(mai_text: str) -> str | None:
    """
    Extract MAI digit from CMS MUE text like '2 Date of Service Edit: Policy'.
    The first character is the MAI code: 1=line, 2=date-of-service/absolute, 3=date-of-service/clinical.
    """
    mai_text = mai_text.strip()
    if mai_text and mai_text[0].isdigit():
        return mai_text[0]
    return None


def load_mue_data(data_dir: str) -> dict:
    """
    Load MUE CSV files into ncci_mue table.

    CMS MUE files are CSV with:
      - Multi-line copyright header (~7-9 lines including blank lines)
      - Column header row: "HCPCS/CPT Code", MUE Values, MAI, Rationale
      - Data rows: CPT, integer, MAI_text, rationale_text

    We detect the data start by looking for the first row where column 0
    matches a CPT/HCPCS code pattern (4-5 alphanumeric chars).
    """
    base = Path(data_dir)
    if not base.exists():
        logger.warning(f"MUE data directory not found: {data_dir}")
        return {"skipped": "MUE data not yet downloaded"}

    mue_files = sorted(
        list(base.glob("*.csv")) + list(base.glob("*.CSV")) +
        list(base.glob("*.txt")) + list(base.glob("*.TXT"))
    )

    if not mue_files:
        return {"skipped": "No MUE files found"}

    total_loaded = 0
    summary = {}

    with engine.begin() as conn:
        conn.execute(text("TRUNCATE TABLE ncci_mue"))

        for filepath in mue_files:
            fname = filepath.name.lower()

            # Determine setting from filename
            if "practitioner" in fname or "pra" in fname:
                setting = "practitioner"
            elif "hospital" in fname or "outpatient" in fname or "hosp" in fname:
                setting = "hospital"
            else:
                # Default based on common naming
                setting = "practitioner"
                logger.warning(f"  → Could not determine MUE setting from filename: {fname}, defaulting to practitioner")

            rows_loaded = 0
            batch = []

            with open(filepath, "r", encoding="latin-1") as f:
                reader = csv.reader(f)
                data_started = False

                for row in reader:
                    if len(row) < 2:
                        continue

                    # Skip until we find a row that starts with a valid CPT code
                    cell0 = row[0].strip()

                    if not data_started:
                        # A valid CPT/HCPCS code: 4-5 alphanumeric (e.g. 0001U, 99213, A4550)
                        if re.match(r"^[A-Za-z0-9]{4,6}$", cell0):
                            data_started = True
                        else:
                            continue

                    cpt = cell0
                    if not re.match(r"^[A-Za-z0-9]{4,6}$", cpt):
                        continue

                    # Column 1: MUE value (integer)
                    try:
                        mue_val = int(row[1].strip())
                    except (ValueError, IndexError):
                        continue

                    # Column 2: MAI text — extract leading digit
                    mai = None
                    if len(row) > 2:
                        mai = _extract_mai_digit(row[2])

                    # Column 3: Rationale
                    rationale = None
                    if len(row) > 3:
                        rationale = row[3].strip()[:255] or None

                    batch.append({
                        "setting": setting,
                        "cpt_code": cpt,
                        "mue_value": mue_val,
                        "mai": mai,
                        "rationale": rationale,
                        "effective_date": None,
                    })

                    if len(batch) >= BATCH_SIZE:
                        _insert_mue_batch(conn, batch)
                        rows_loaded += len(batch)
                        batch = []

                if batch:
                    _insert_mue_batch(conn, batch)
                    rows_loaded += len(batch)

            logger.info(f"  → {filepath.name}: {rows_loaded:,} rows ({setting})")
            summary[filepath.name] = rows_loaded
            total_loaded += rows_loaded

    logger.info(f"MUE ETL complete — {total_loaded:,} total rows")
    summary["total"] = total_loaded
    return summary


def _insert_mue_batch(conn, batch: list[dict]):
    """Bulk insert MUE rows."""
    stmt = text("""
        INSERT INTO ncci_mue (setting, cpt_code, mue_value, mai, rationale, effective_date)
        VALUES (:setting, :cpt_code, :mue_value, :mai, :rationale, :effective_date)
    """)
    conn.execute(stmt, batch)


# ─────────────────────────────────────────
# PFS ETL — RVU + GPCI tables
# ─────────────────────────────────────────

# 2026 CMS Conversion Factor
CMS_CONVERSION_FACTOR = 33.4009

# RVU file: 10 header lines, then data
# Columns we care about (0-indexed):
#   [0] HCPCS  [1] MOD  [2] DESCRIPTION  [3] STATUS CODE
#   [5] WORK RVU  [6] NON-FAC PE RVU  [8] FACILITY PE RVU
#   [10] MP RVU  [11] NON-FACILITY TOTAL  [12] FACILITY TOTAL
#   [25] CONV FACTOR
RVU_HEADER_LINES = 10


def load_pfs_data(data_dir: str) -> dict:
    """
    Load RVU and GPCI data into pfs_rvu and gpci_locality tables.
    """
    base = Path(data_dir)
    if not base.exists():
        logger.warning(f"PFS data directory not found: {data_dir}")
        return {"skipped": "PFS data not yet downloaded"}

    results = {}

    # Load RVU file
    rvu_result = _load_rvu_file(base)
    results["rvu"] = rvu_result

    # Load GPCI file
    gpci_result = _load_gpci_file(base)
    results["gpci"] = gpci_result

    return results


def _load_rvu_file(base: Path) -> dict:
    """Load PPRRVU CSV into pfs_rvu table."""
    rvu_files = sorted(
        list(base.rglob("PPRRVU*nonQPP*.csv")) +
        list(base.rglob("PPRRVU*nonQPP*.txt"))
    )
    # Fall back to any PPRRVU file
    if not rvu_files:
        rvu_files = sorted(
            list(base.rglob("PPRRVU*.csv")) +
            list(base.rglob("PPRRVU*.txt"))
        )

    if not rvu_files:
        return {"skipped": "No PPRRVU files found"}

    filepath = rvu_files[0]  # use the first match
    logger.info(f"Loading RVU data from {filepath.name}...")

    total_loaded = 0
    batch = []

    with engine.begin() as conn:
        conn.execute(text("TRUNCATE TABLE pfs_rvu"))

        with open(filepath, "r", encoding="latin-1") as f:
            reader = csv.reader(f)
            for line_num, row in enumerate(reader):
                # Skip header lines
                if line_num < RVU_HEADER_LINES:
                    continue

                if len(row) < 13:
                    continue

                hcpcs = row[0].strip()
                if not hcpcs or not re.match(r"^[A-Za-z0-9]{4,6}$", hcpcs):
                    continue

                modifier = row[1].strip() or None
                description = row[2].strip()[:255] if row[2].strip() else None
                status_code = row[3].strip() or None

                work_rvu = _safe_float(row[5])
                nonfac_pe_rvu = _safe_float(row[6])
                facility_pe_rvu = _safe_float(row[8])
                mp_rvu = _safe_float(row[10])
                nonfac_total = _safe_float(row[11])
                facility_total = _safe_float(row[12])
                conv_factor = _safe_float(row[25]) if len(row) > 25 else CMS_CONVERSION_FACTOR

                batch.append({
                    "hcpcs": hcpcs,
                    "modifier": modifier,
                    "description": description,
                    "status_code": status_code,
                    "work_rvu": work_rvu,
                    "nonfac_pe_rvu": nonfac_pe_rvu,
                    "facility_pe_rvu": facility_pe_rvu,
                    "mp_rvu": mp_rvu,
                    "nonfac_total": nonfac_total,
                    "facility_total": facility_total,
                    "conv_factor": conv_factor,
                })

                if len(batch) >= BATCH_SIZE:
                    _insert_rvu_batch(conn, batch)
                    total_loaded += len(batch)
                    batch = []

            if batch:
                _insert_rvu_batch(conn, batch)
                total_loaded += len(batch)

    logger.info(f"  → {filepath.name}: {total_loaded:,} RVU rows")
    return {filepath.name: total_loaded, "total": total_loaded}


def _insert_rvu_batch(conn, batch: list[dict]):
    stmt = text("""
        INSERT INTO pfs_rvu
            (hcpcs, modifier, description, status_code,
             work_rvu, nonfac_pe_rvu, facility_pe_rvu, mp_rvu,
             nonfac_total, facility_total, conv_factor)
        VALUES
            (:hcpcs, :modifier, :description, :status_code,
             :work_rvu, :nonfac_pe_rvu, :facility_pe_rvu, :mp_rvu,
             :nonfac_total, :facility_total, :conv_factor)
    """)
    conn.execute(stmt, batch)


def _load_gpci_file(base: Path) -> dict:
    """Load GPCI CSV into gpci_locality table, enriched with county info."""
    gpci_files = sorted(
        list(base.rglob("GPCI*.csv")) +
        list(base.rglob("GPCI*.txt"))
    )

    if not gpci_files:
        return {"skipped": "No GPCI files found"}

    filepath = gpci_files[0]
    logger.info(f"Loading GPCI data from {filepath.name}...")

    # ── Pre-load locality→county crosswalk (26LOCCO) ──
    county_map = _load_locality_county_crosswalk(base)

    total_loaded = 0
    batch = []

    with engine.begin() as conn:
        conn.execute(text("TRUNCATE TABLE gpci_locality"))

        with open(filepath, "r", encoding="latin-1") as f:
            reader = csv.reader(f)
            data_started = False

            for row in reader:
                if len(row) < 8:
                    continue

                mac = row[0].strip()

                # Detect data start: MAC is a number like "10112"
                if not data_started:
                    if mac and mac[0].isdigit() and len(mac) >= 4:
                        data_started = True
                    else:
                        continue

                if not mac or not mac[0].isdigit():
                    continue

                state = row[1].strip()
                locality_number = row[2].strip()
                locality_name = row[3].strip().rstrip("*")

                # Column 5 = PW GPCI with 1.0 floor (what CMS actually uses)
                pw_gpci = _safe_float(row[5]) if len(row) > 5 else 1.0
                pe_gpci = _safe_float(row[6]) if len(row) > 6 else 1.0
                mp_gpci = _safe_float(row[7]) if len(row) > 7 else 1.0

                # Look up counties from crosswalk
                counties = county_map.get((state, locality_number), "")

                batch.append({
                    "mac": mac,
                    "state": state,
                    "locality_number": locality_number,
                    "locality_name": locality_name,
                    "counties": counties,
                    "pw_gpci": pw_gpci,
                    "pe_gpci": pe_gpci,
                    "mp_gpci": mp_gpci,
                })

                if len(batch) >= BATCH_SIZE:
                    _insert_gpci_batch(conn, batch)
                    total_loaded += len(batch)
                    batch = []

            if batch:
                _insert_gpci_batch(conn, batch)
                total_loaded += len(batch)

    logger.info(f"  → {filepath.name}: {total_loaded:,} GPCI rows")
    return {filepath.name: total_loaded, "total": total_loaded}


def _load_locality_county_crosswalk(base: Path) -> dict[tuple[str, str], str]:
    """Parse 26LOCCO.csv → dict of (state, locality_number) → county string.

    The file format:
      MAC, Locality Number, State, Fee Schedule Area, Counties
    State only appears on the first row of each state group; subsequent rows
    for the same state leave the state column blank.
    """
    locco_files = sorted(
        list(base.rglob("*LOCCO*.csv")) +
        list(base.rglob("*LOCCO*.txt"))
    )
    if not locco_files:
        logger.info("No LOCCO county crosswalk file found — skipping county enrichment")
        return {}

    filepath = locco_files[0]
    logger.info(f"Loading locality-county crosswalk from {filepath.name}...")
    result: dict[tuple[str, str], str] = {}
    current_state = ""

    with open(filepath, "r", encoding="latin-1") as f:
        reader = csv.reader(f)
        data_started = False

        for row in reader:
            if len(row) < 5:
                continue

            mac = row[0].strip()

            # Detect data start: MAC is a number like "10112"
            if not data_started:
                if mac and mac[0].isdigit() and len(mac) >= 4:
                    data_started = True
                else:
                    continue

            # Track current state (only set on first row of each group)
            state_col = row[2].strip().rstrip("*").strip()
            if state_col:
                current_state = state_col

            if not current_state:
                continue

            locality_number = row[1].strip()
            counties = row[4].strip().rstrip(",").strip() if len(row) > 4 else ""

            if not locality_number or not locality_number[0].isdigit():
                continue

            # State names in LOCCO are full names; we need 2-letter codes.
            # The GPCI file uses 2-letter codes; LOCCO uses full names or 2-letter.
            # Normalize: if it's >2 chars, convert with a lookup.
            state_key = _state_abbrev(current_state) if len(current_state) > 2 else current_state

            key = (state_key, locality_number)
            if key in result:
                # Append if multiple county lines for same locality
                result[key] = result[key] + ", " + counties if counties else result[key]
            else:
                result[key] = counties

    logger.info(f"  → {filepath.name}: {len(result)} locality-county mappings")
    return result


# State name → 2-letter abbreviation
_STATE_ABBREVS = {
    "ALABAMA": "AL", "ALASKA": "AK", "ARIZONA": "AZ", "ARKANSAS": "AR",
    "CALIFORNIA": "CA", "COLORADO": "CO", "CONNECTICUT": "CT", "DELAWARE": "DE",
    "DISTRICT OF COLUMBIA": "DC", "FLORIDA": "FL", "GEORGIA": "GA",
    "HAWAII/GUAM": "HI", "HAWAII": "HI", "IDAHO": "ID", "ILLINOIS": "IL",
    "INDIANA": "IN", "IOWA": "IA", "KANSAS": "KS", "KENTUCKY": "KY",
    "LOUISIANA": "LA", "MAINE": "ME", "MARYLAND": "MD", "MASSACHUSETTS": "MA",
    "MICHIGAN": "MI", "MINNESOTA": "MN", "MISSISSIPPI": "MS", "MISSOURI": "MO",
    "MONTANA": "MT", "NEBRASKA": "NE", "NEVADA": "NV", "NEW HAMPSHIRE": "NH",
    "NEW JERSEY": "NJ", "NEW MEXICO": "NM", "NEW YORK": "NY",
    "NORTH CAROLINA": "NC", "NORTH DAKOTA": "ND", "OHIO": "OH", "OKLAHOMA": "OK",
    "OREGON": "OR", "PENNSYLVANIA": "PA", "PUERTO RICO": "PR",
    "RHODE ISLAND": "RI", "SOUTH CAROLINA": "SC", "SOUTH DAKOTA": "SD",
    "TENNESSEE": "TN", "TEXAS": "TX", "UTAH": "UT", "VERMONT": "VT",
    "VIRGIN ISLANDS": "VI", "VIRGINIA": "VA", "WASHINGTON": "WA",
    "WEST VIRGINIA": "WV", "WISCONSIN": "WI", "WYOMING": "WY",
}


def _state_abbrev(name: str) -> str:
    """Convert a state name to its 2-letter abbreviation."""
    return _STATE_ABBREVS.get(name.upper().strip(), name.strip()[:2].upper())


def _insert_gpci_batch(conn, batch: list[dict]):
    stmt = text("""
        INSERT INTO gpci_locality
            (mac, state, locality_number, locality_name, counties,
             pw_gpci, pe_gpci, mp_gpci)
        VALUES
            (:mac, :state, :locality_number, :locality_name, :counties,
             :pw_gpci, :pe_gpci, :mp_gpci)
    """)
    conn.execute(stmt, batch)


def _safe_float(val: str) -> float:
    """Parse float from CSV cell, return 0.0 on failure."""
    try:
        v = val.strip()
        return float(v) if v else 0.0
    except (ValueError, AttributeError):
        return 0.0


# ─────────────────────────────────────────
# CHECK IF DATA IS LOADED
# ─────────────────────────────────────────

def is_ptp_data_loaded() -> bool:
    try:
        with engine.connect() as conn:
            count = conn.execute(text("SELECT COUNT(*) FROM ncci_ptp")).scalar()
            return count is not None and count > 0
    except Exception:
        return False


def is_mue_data_loaded() -> bool:
    try:
        with engine.connect() as conn:
            count = conn.execute(text("SELECT COUNT(*) FROM ncci_mue")).scalar()
            return count is not None and count > 0
    except Exception:
        return False


def is_pfs_data_loaded() -> bool:
    """Check if RVU data has been loaded."""
    try:
        with engine.connect() as conn:
            count = conn.execute(text("SELECT COUNT(*) FROM pfs_rvu")).scalar()
            return count is not None and count > 0
    except Exception:
        return False


def is_gpci_data_loaded() -> bool:
    try:
        with engine.connect() as conn:
            count = conn.execute(text("SELECT COUNT(*) FROM gpci_locality")).scalar()
            return count is not None and count > 0
    except Exception:
        return False


# ─────────────────────────────────────────
# MASTER LOADER
# ─────────────────────────────────────────

def load_all_billing_data(
    ptp_dir: str,
    mue_dir: str,
    pfs_dir: str,
) -> dict:
    """
    Load all billing reference data. Called on startup if tables are empty.
    Each dataset is independent — one failing won't block the others.
    """
    results = {}

    if not is_ptp_data_loaded():
        logger.info("Loading PTP data...")
        results["ptp"] = load_ptp_data(ptp_dir)
    else:
        results["ptp"] = {"status": "already loaded"}

    if not is_mue_data_loaded():
        logger.info("Loading MUE data...")
        results["mue"] = load_mue_data(mue_dir)
    else:
        results["mue"] = {"status": "already loaded"}

    if not is_pfs_data_loaded():
        logger.info("Loading PFS (RVU + GPCI) data...")
        results["pfs"] = load_pfs_data(pfs_dir)
    else:
        results["pfs"] = {"status": "already loaded"}
        # Still check GPCI separately
        if not is_gpci_data_loaded():
            logger.info("Loading GPCI data...")
            results["gpci"] = _load_gpci_file(Path(pfs_dir))

    return results
