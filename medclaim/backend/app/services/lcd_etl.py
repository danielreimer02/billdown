"""
ETL: Load CMS Medicare Coverage Database CSVs into Postgres.

Data source: https://www.cms.gov/medicare-coverage-database/downloads/downloads.aspx
  - all_lcd_csv.zip    → lcd.csv, lcd_related_documents.csv, contractor_jurisdiction.csv
  - current_article_csv.zip → article.csv, article_x_hcpc_code.csv,
                               article_x_icd10_covered.csv, article_x_icd10_noncovered.csv,
                               article_x_contractor.csv, state_lookup.csv

Strategy: TRUNCATE + reload (idempotent). Run once on startup if tables are empty.
Total rows: ~600K across all tables. Takes ~30s on first load.
"""

import csv
import logging
import os
import zipfile
from pathlib import Path

from sqlalchemy import text
from app.db.session import engine

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────
# CSV file → table name mapping
# Each tuple: (csv_filename, table_name, subdirectory_hint)
# ─────────────────────────────────────────

TABLE_MAP = [
    # LCD tables (from all_lcd/)
    ("lcd.csv", "lcd", "all_lcd"),
    ("lcd_related_documents.csv", "lcd_related_documents", "all_lcd"),
    ("contractor_jurisdiction.csv", "contractor_jurisdiction", "all_lcd"),
    # Article tables (from current_article/)
    ("article.csv", "article", "current_article"),
    ("article_x_hcpc_code.csv", "article_x_hcpc_code", "current_article"),
    ("article_x_icd10_covered.csv", "article_x_icd10_covered", "current_article"),
    ("article_x_icd10_noncovered.csv", "article_x_icd10_noncovered", "current_article"),
    ("article_x_contractor.csv", "article_x_contractor", "current_article"),
    ("state_lookup.csv", "state_lookup", "current_article"),
]

# Tables where we filter to only active/current records
ACTIVE_FILTER_TABLES = {"lcd", "article"}

# Column sets per table (must match lcd_models.py)
TABLE_COLUMNS = {
    "lcd": [
        "lcd_id", "lcd_version", "title", "determination_number",
        "status", "display_id", "last_updated",
    ],
    "lcd_related_documents": [
        "lcd_id", "lcd_version", "related_num",
        "r_article_id", "r_article_version",
        "r_lcd_id", "r_lcd_version", "r_contractor_id", "last_updated",
    ],
    "contractor_jurisdiction": [
        "contractor_id", "contractor_type_id", "contractor_version",
        "state_id", "last_updated", "active_date", "term_date",
    ],
    "article": [
        "article_id", "article_version", "article_type",
        "title", "status", "last_updated",
    ],
    "article_x_hcpc_code": [
        "article_id", "article_version", "hcpc_code_id",
        "hcpc_code_version", "hcpc_code_group", "range",
        "last_updated", "long_description", "short_description",
    ],
    "article_x_icd10_covered": [
        "article_id", "article_version", "icd10_code_id",
        "icd10_code_version", "icd10_covered_group", "range",
        "last_updated", "sort_order", "description", "asterisk",
    ],
    "article_x_icd10_noncovered": [
        "article_id", "article_version", "icd10_code_id",
        "icd10_code_version", "icd10_noncovered_group", "range",
        "last_updated", "sort_order", "description", "asterisk",
    ],
    "article_x_contractor": [
        "article_id", "article_version", "article_type",
        "contractor_id", "contractor_type_id", "contractor_version",
        "last_updated",
    ],
    "state_lookup": [
        "state_id", "state_abbrev", "description",
    ],
}

BATCH_SIZE = 5000


def _find_csv(data_dir: str, csv_name: str, subdir_hint: str) -> Path | None:
    """Find a CSV file, checking csv_extracted/ subdirectory first."""
    base = Path(data_dir)

    # Primary: <data_dir>/<subdir_hint>/csv_extracted/<csv_name>
    candidate = base / subdir_hint / "csv_extracted" / csv_name
    if candidate.exists():
        return candidate

    # Fallback: directly in subdir
    candidate = base / subdir_hint / csv_name
    if candidate.exists():
        return candidate

    # Last resort: anywhere
    candidate = base / csv_name
    if candidate.exists():
        return candidate

    return None


def _ensure_csvs_extracted(data_dir: str):
    """Auto-extract any zip files that haven't been extracted yet."""
    base = Path(data_dir)
    for subdir in ["all_lcd", "current_article"]:
        folder = base / subdir
        if not folder.exists():
            continue
        extracted = folder / "csv_extracted"
        if extracted.exists() and any(extracted.iterdir()):
            continue  # Already extracted
        for zf in folder.glob("*.zip"):
            logger.info(f"Extracting {zf.name} → {extracted}")
            extracted.mkdir(exist_ok=True)
            with zipfile.ZipFile(zf, "r") as z:
                z.extractall(extracted)


def _load_table(
    conn,
    csv_path: Path,
    table_name: str,
    columns: list[str],
    active_only: bool = False,
):
    """Load a single CSV into its Postgres table via TRUNCATE + batch INSERT."""
    logger.info(f"Loading {table_name} from {csv_path.name}...")

    # Truncate
    conn.execute(text(f"TRUNCATE TABLE {table_name} CASCADE"))

    rows_loaded = 0
    batch = []

    with open(csv_path, "r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)

        for row in reader:
            # Filter to active records for LCD/Article tables
            if active_only:
                status = row.get("status", "").strip().upper()
                if status not in ("A", "ACTIVE", ""):
                    continue

            # Extract only the columns we care about
            cleaned = {}
            for col in columns:
                val = row.get(col, "").strip()
                if val == "":
                    cleaned[col] = None
                else:
                    cleaned[col] = val

            batch.append(cleaned)

            if len(batch) >= BATCH_SIZE:
                _insert_batch(conn, table_name, columns, batch)
                rows_loaded += len(batch)
                batch = []

        # Final batch
        if batch:
            _insert_batch(conn, table_name, columns, batch)
            rows_loaded += len(batch)

    logger.info(f"  → {table_name}: {rows_loaded:,} rows loaded")
    return rows_loaded


def _insert_batch(conn, table_name: str, columns: list[str], batch: list[dict]):
    """Bulk insert a batch of rows."""
    if not batch:
        return
    col_list = ", ".join(columns)
    param_list = ", ".join(f":{c}" for c in columns)
    stmt = text(f"INSERT INTO {table_name} ({col_list}) VALUES ({param_list})")
    conn.execute(stmt, batch)


def is_lcd_data_loaded() -> bool:
    """Check if LCD data has already been loaded (non-empty tables)."""
    try:
        with engine.connect() as conn:
            result = conn.execute(text("SELECT COUNT(*) FROM article_x_hcpc_code"))
            count = result.scalar()
            return count is not None and count > 0
    except Exception:
        return False


def load_lcd_data(data_dir: str) -> dict:
    """
    Main ETL entry point. Load all CMS CSVs into Postgres.

    Returns summary dict with row counts per table.
    """
    logger.info(f"Starting LCD ETL from {data_dir}")

    if not os.path.isdir(data_dir):
        logger.warning(f"LCD data directory not found: {data_dir}")
        return {"error": f"Directory not found: {data_dir}"}

    # Auto-extract zips if needed
    _ensure_csvs_extracted(data_dir)

    summary = {}

    with engine.begin() as conn:
        for csv_name, table_name, subdir in TABLE_MAP:
            csv_path = _find_csv(data_dir, csv_name, subdir)
            if csv_path is None:
                logger.warning(f"CSV not found: {csv_name} (looked in {subdir}/)")
                summary[table_name] = 0
                continue

            columns = TABLE_COLUMNS.get(table_name, [])
            if not columns:
                logger.warning(f"No column mapping for table {table_name}")
                summary[table_name] = 0
                continue

            active_only = table_name in ACTIVE_FILTER_TABLES
            try:
                count = _load_table(conn, csv_path, table_name, columns, active_only)
                summary[table_name] = count
            except Exception as e:
                logger.error(f"Failed to load {table_name}: {e}")
                summary[table_name] = f"ERROR: {e}"

    total = sum(v for v in summary.values() if isinstance(v, int))
    logger.info(f"LCD ETL complete — {total:,} total rows across {len(summary)} tables")
    return summary
