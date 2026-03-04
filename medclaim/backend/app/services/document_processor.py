"""
Document processing service.

Strategy:
- Native PDFs → pdfplumber (fastest, best table accuracy)
- Everything else → Docling (IBM open source, Apache 2.0, local)
  (scanned PDF, jpg, png, fax, phone photo)

Why:
  pdfplumber — purpose-built for cell extraction, tiny install
  Docling    — best free option for scanned docs, runs locally, no API cost
  No Tesseract — weak table extraction
  No PaddleOCR — Baidu owned, trust issue for healthcare app
  No Textract  — costs money, Docling is close enough for V1
"""

import io
import logging
import re
import tempfile
from pathlib import Path
from dataclasses import dataclass, field

import pdfplumber
from docling.datamodel.base_models import InputFormat
from docling.datamodel.pipeline_options import (
    EasyOcrOptions,
    PdfPipelineOptions,
)
from docling.document_converter import DocumentConverter, ImageFormatOption, PdfFormatOption

logger = logging.getLogger(__name__)

# Initialize Docling converter once — reuse across requests.
# Models are pre-downloaded in the Dockerfile so this is fast.
_converter: DocumentConverter | None = None


def _get_converter() -> DocumentConverter:
    """Lazy-init Docling converter with English OCR."""
    global _converter
    if _converter is None:
        ocr_options = EasyOcrOptions(lang=["en"], use_gpu=False)

        # Both PDF and Image use PdfPipelineOptions — the image pipeline
        # internally runs StandardPdfPipeline which needs the full option set
        # (do_ocr, do_table_structure, do_chart_extraction, etc.)
        pipeline_opts = PdfPipelineOptions(ocr_options=ocr_options)

        _converter = DocumentConverter(
            format_options={
                InputFormat.IMAGE: ImageFormatOption(pipeline_options=pipeline_opts),
                InputFormat.PDF: PdfFormatOption(pipeline_options=pipeline_opts),
            }
        )
    return _converter


@dataclass
class CodeWithAmount:
    """A CPT code paired with its billed amount (if known)."""
    cpt_code: str
    amount: float | None = None
    description: str = ""


@dataclass
class ExtractedDocument:
    raw_text: str
    cpt_codes: list[str] = field(default_factory=list)
    icd10_codes: list[str] = field(default_factory=list)
    dollar_amounts: list[float] = field(default_factory=list)
    is_native_pdf: bool = True
    # Paired CPT → amount from table rows (more accurate than separate lists)
    code_amount_pairs: list[CodeWithAmount] = field(default_factory=list)


# ─────────────────────────────────────────
# ROUTING
# ─────────────────────────────────────────

def process_document(file_bytes: bytes, filename: str) -> ExtractedDocument:
    """
    Route to correct extractor based on file type.

    PDFs: try pdfplumber first (free, perfect for native PDFs).
          If text is too short (<50 chars), it's a scanned PDF → Docling.
    Images: straight to Docling.
    """
    suffix = Path(filename).suffix.lower()

    if suffix == ".pdf":
        text = _try_native_pdf(file_bytes)
        if text and len(text.strip()) > 50:
            return _parse_extracted_text(text, is_native=True)

        # Scanned PDF — fall back to Docling
        text = _extract_with_docling(file_bytes, filename)
        return _parse_extracted_text(text, is_native=False)

    elif suffix in (".jpg", ".jpeg", ".png"):
        text = _extract_with_docling(file_bytes, filename)
        return _parse_extracted_text(text, is_native=False)

    else:
        raise ValueError(f"Unsupported file type: {suffix}")


# ─────────────────────────────────────────
# NATIVE PDF — pdfplumber
# ─────────────────────────────────────────

def _try_native_pdf(file_bytes: bytes) -> str:
    """
    pdfplumber handles native PDFs perfectly.
    Also extracts tables — important for itemized bills.
    Returns empty string if the PDF is scanned (no selectable text).
    """
    full_text: list[str] = []

    try:
        with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
            for page in pdf.pages:
                text = page.extract_text()
                if text:
                    full_text.append(text)

                tables = page.extract_tables()
                for table in tables:
                    for row in table:
                        if row:
                            row_text = " | ".join(
                                str(cell) for cell in row if cell
                            )
                            full_text.append(row_text)
    except Exception as e:
        logger.warning(f"pdfplumber extraction failed: {e}")
        return ""

    return "\n".join(full_text)


# ─────────────────────────────────────────
# DOCLING — scanned PDFs + images
# ─────────────────────────────────────────

def _extract_with_docling(file_bytes: bytes, filename: str) -> str:
    """
    Docling handles scanned PDFs, JPGs, PNGs, fax images, phone photos.
    Converts to Markdown — preserves table structure well.

    Docling needs a file path (not raw bytes), so we write to a temp file.
    """
    converter = _get_converter()
    suffix = Path(filename).suffix.lower()

    try:
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=True) as tmp:
            tmp.write(file_bytes)
            tmp.flush()

            result = converter.convert(tmp.name)
            return result.document.export_to_markdown()

    except Exception as e:
        logger.error(f"Docling extraction failed for {filename}: {e}")
        return ""


# ─────────────────────────────────────────
# CODE EXTRACTION
# ─────────────────────────────────────────

# CPT codes: 5 digits, sometimes with modifiers (99214-25)
CPT_PATTERN = re.compile(r"\b(\d{5})(?:-\d{2})?\b")

# ICD-10: letter + 2 digits + optional decimal + more chars
# Examples: M17.11, J18.9, Z87.891
ICD10_PATTERN = re.compile(r"\b([A-Z]\d{2}\.?\w{0,4})\b")

# Dollar amounts — require $ or be in a Charge/Balance column context
# Strict: must have $ prefix to avoid matching dates like 04.2026
DOLLAR_STRICT_PATTERN = re.compile(r"\$([\d,]+\.\d{2})")
# Relaxed: bare number, used only inside known table columns
DOLLAR_BARE_PATTERN = re.compile(r"\b([\d,]+\.\d{2})\b")

# Known CPT ranges to reduce false positives
CPT_MIN = 10000
CPT_MAX = 99499

# ─────────────────────────────────────────
# DESCRIPTION → CPT MAPPING
# Common billing descriptions that appear on summary bills
# without explicit CPT codes. Fuzzy-matched against OCR text.
# ─────────────────────────────────────────

DESCRIPTION_TO_CPT: list[tuple[re.Pattern, str, str]] = [
    # E/M — Office visits (established patient)
    (re.compile(r"office\s*visit.*(?:est|estab).*level\s*1", re.I), "99211", "Office Visit, Est. Pt., Level 1"),
    (re.compile(r"office\s*visit.*(?:est|estab).*level\s*2", re.I), "99212", "Office Visit, Est. Pt., Level 2"),
    (re.compile(r"office\s*visit.*(?:est|estab).*level\s*3", re.I), "99213", "Office Visit, Est. Pt., Level 3"),
    (re.compile(r"office\s*visit.*(?:est|estab).*level\s*4", re.I), "99214", "Office Visit, Est. Pt., Level 4"),
    (re.compile(r"office\s*visit.*(?:est|estab).*level\s*5", re.I), "99215", "Office Visit, Est. Pt., Level 5"),
    # E/M — Office visits (new patient) — OCR-tolerant: "Newv", "New", "Mew", etc.
    (re.compile(r"(?:office\s*)?visit.*new?\w*\s*p\w*.*level\s*1", re.I), "99201", "Office Visit, New Pt., Level 1"),
    (re.compile(r"(?:office\s*)?visit.*new?\w*\s*p\w*.*level\s*2", re.I), "99202", "Office Visit, New Pt., Level 2"),
    (re.compile(r"(?:office\s*)?visit.*new?\w*\s*p\w*.*level\s*3", re.I), "99203", "Office Visit, New Pt., Level 3"),
    (re.compile(r"(?:office\s*)?visit.*new?\w*\s*p\w*.*level\s*4", re.I), "99204", "Office Visit, New Pt., Level 4"),
    (re.compile(r"(?:office\s*)?visit.*new?\w*\s*p\w*.*level\s*5", re.I), "99205", "Office Visit, New Pt., Level 5"),
    # Shorthand — just "New Patient" + level (OCR may drop "Office Visit")
    (re.compile(r"new?\w*\s*(?:pt|pat|patient)\w*.*level\s*1", re.I), "99201", "New Patient, Level 1"),
    (re.compile(r"new?\w*\s*(?:pt|pat|patient)\w*.*level\s*2", re.I), "99202", "New Patient, Level 2"),
    (re.compile(r"new?\w*\s*(?:pt|pat|patient)\w*.*level\s*3", re.I), "99203", "New Patient, Level 3"),
    (re.compile(r"new?\w*\s*(?:pt|pat|patient)\w*.*level\s*4", re.I), "99204", "New Patient, Level 4"),
    (re.compile(r"new?\w*\s*(?:pt|pat|patient)\w*.*level\s*5", re.I), "99205", "New Patient, Level 5"),
    # Just "Level N" with "new" somewhere nearby
    (re.compile(r"new\w*.*level\s*1", re.I), "99201", "New Patient, Level 1"),
    (re.compile(r"new\w*.*level\s*2", re.I), "99202", "New Patient, Level 2"),
    (re.compile(r"new\w*.*level\s*3", re.I), "99203", "New Patient, Level 3"),
    (re.compile(r"new\w*.*level\s*4", re.I), "99204", "New Patient, Level 4"),
    (re.compile(r"new\w*.*level\s*5", re.I), "99205", "New Patient, Level 5"),
    # ER visits
    (re.compile(r"(?:er|emergency|ed)\s*visit.*level\s*1", re.I), "99281", "ER Visit, Level 1"),
    (re.compile(r"(?:er|emergency|ed)\s*visit.*level\s*2", re.I), "99282", "ER Visit, Level 2"),
    (re.compile(r"(?:er|emergency|ed)\s*visit.*level\s*3", re.I), "99283", "ER Visit, Level 3"),
    (re.compile(r"(?:er|emergency|ed)\s*visit.*level\s*4", re.I), "99284", "ER Visit, Level 4"),
    (re.compile(r"(?:er|emergency|ed)\s*visit.*level\s*5", re.I), "99285", "ER Visit, Level 5"),
    # Hospital
    (re.compile(r"(?:initial\s*)?hosp(?:ital)?\s*(?:admit|admission|care).*level\s*1", re.I), "99221", "Hospital Admission, Level 1"),
    (re.compile(r"(?:initial\s*)?hosp(?:ital)?\s*(?:admit|admission|care).*level\s*2", re.I), "99222", "Hospital Admission, Level 2"),
    (re.compile(r"(?:initial\s*)?hosp(?:ital)?\s*(?:admit|admission|care).*level\s*3", re.I), "99223", "Hospital Admission, Level 3"),
    # Common procedures
    (re.compile(r"knee\s*replace", re.I), "27447", "Total Knee Replacement"),
    (re.compile(r"hip\s*replace", re.I), "27130", "Total Hip Replacement"),
    (re.compile(r"(?:ct|cat)\s*scan.*head", re.I), "70450", "CT Scan Head"),
    (re.compile(r"(?:ct|cat)\s*scan.*abdomen", re.I), "74150", "CT Scan Abdomen"),
    (re.compile(r"mri.*brain", re.I), "70551", "MRI Brain"),
    (re.compile(r"mri.*knee", re.I), "73721", "MRI Knee"),
    (re.compile(r"x-?ray.*chest", re.I), "71046", "Chest X-Ray"),
    (re.compile(r"chest\s*x-?ray", re.I), "71046", "Chest X-Ray"),
    (re.compile(r"blood\s*(?:work|panel|draw|test)", re.I), "36415", "Venipuncture / Blood Draw"),
    (re.compile(r"(?:cbc|complete\s*blood\s*count)", re.I), "85025", "CBC"),
    (re.compile(r"(?:cmp|comprehensive\s*metabolic)", re.I), "80053", "Comprehensive Metabolic Panel"),
    (re.compile(r"(?:bmp|basic\s*metabolic)", re.I), "80048", "Basic Metabolic Panel"),
    (re.compile(r"urinalysis", re.I), "81003", "Urinalysis"),
    (re.compile(r"ekg|electrocardiogram", re.I), "93000", "EKG"),
    (re.compile(r"physical\s*therapy.*eval", re.I), "97161", "PT Evaluation"),
    (re.compile(r"flu\s*(?:shot|vaccine)", re.I), "90686", "Flu Vaccine"),
    (re.compile(r"covid.*(?:test|pcr)", re.I), "87635", "COVID-19 PCR Test"),
    # Lab-specific codes commonly seen on hospital bills
    (re.compile(r"venipuncture", re.I), "36415", "Venipuncture"),
    (re.compile(r"ferritin", re.I), "82728", "Ferritin"),
    (re.compile(r"iron\s*(?:level|serum|test)", re.I), "83540", "Iron Level"),
    (re.compile(r"transferrin", re.I), "84466", "Transferrin Level"),
    (re.compile(r"cortisol", re.I), "82533", "Cortisol"),
    (re.compile(r"vitamin\s*d.*(?:25|hydroxy)", re.I), "82306", "Vitamin D 25-Hydroxy"),
    (re.compile(r"(?:gammaglobulin|immunoglobulin).*iga", re.I), "82784", "Gammaglobulin IGA"),
    (re.compile(r"gliadin.*iga|iga.*gliadin", re.I), "86258", "Gliadin IGA Immunoassay"),
    (re.compile(r"ttg.*iga|iga.*ttg|tissue\s*transglutaminase", re.I), "86364", "TTG-IGA Immunoassay"),
    (re.compile(r"celiac\s*(?:screen|panel)", re.I), "82784", "Celiac Screen Panel"),
    (re.compile(r"hemoglobin\s*a1c|hba1c|glycated\s*hemoglobin", re.I), "83036", "Hemoglobin A1C"),
    (re.compile(r"thyroid.*(?:tsh|stimulat)", re.I), "84443", "TSH"),
    (re.compile(r"lipid\s*panel", re.I), "80061", "Lipid Panel"),
]


@dataclass
class _TableRow:
    """A parsed row from a Markdown or pdfplumber table."""
    description: str = ""
    charge: float | None = None
    pmt_adj: float | None = None
    balance: float | None = None
    cpt_code: str | None = None
    raw: str = ""


def _parse_markdown_table(text: str) -> list[_TableRow]:
    """
    Parse Markdown-formatted tables from Docling output.
    Docling outputs tables like:
      | Date | Description | Charge | Pmt/Adj | Balance |
      |------|-------------|--------|---------|---------|
      | ...  | ...         | 696.00 |         |         |
    """
    rows: list[_TableRow] = []
    lines = text.strip().split("\n")

    # Find table header to identify column positions
    header_idx = -1
    col_names: list[str] = []
    for i, line in enumerate(lines):
        if "|" in line and "---" not in line:
            cells = [c.strip() for c in line.split("|")]
            # Check if this looks like a header (has Description/Charge etc.)
            lower_cells = [c.lower() for c in cells]
            if any(kw in " ".join(lower_cells) for kw in ["description", "charge", "service", "procedure", "amount", "code"]):
                header_idx = i
                col_names = cells
                break

    if header_idx < 0:
        return rows

    # Map column indices
    desc_col = -1
    charge_col = -1
    pmt_col = -1
    balance_col = -1
    code_col = -1

    for idx, name in enumerate(col_names):
        nl = name.lower()
        if any(k in nl for k in ["description", "service", "procedure"]):
            desc_col = idx
        elif any(k in nl for k in ["charge", "amount", "billed"]):
            charge_col = idx
        elif any(k in nl for k in ["pmt", "adj", "payment", "insurance"]):
            pmt_col = idx
        elif "balance" in nl:
            balance_col = idx
        elif any(k in nl for k in ["code", "cpt", "hcpc"]):
            code_col = idx

    # Parse data rows (skip header and separator)
    for line in lines[header_idx + 1:]:
        if "---" in line or "|" not in line:
            continue
        cells = [c.strip() for c in line.split("|")]
        if len(cells) < 2:
            continue

        row = _TableRow(raw=line)

        if desc_col >= 0 and desc_col < len(cells):
            row.description = cells[desc_col]

        if code_col >= 0 and code_col < len(cells):
            m = CPT_PATTERN.search(cells[code_col])
            if m and CPT_MIN <= int(m.group(1)) <= CPT_MAX:
                row.cpt_code = m.group(1)

        for col_idx, attr in [(charge_col, "charge"), (pmt_col, "pmt_adj"), (balance_col, "balance")]:
            if col_idx >= 0 and col_idx < len(cells):
                m = DOLLAR_BARE_PATTERN.search(cells[col_idx])
                if m:
                    try:
                        val = float(m.group(1).replace(",", ""))
                        # Skip date-like values (month.year patterns)
                        if val > 1.0:  # skip tiny values that are likely OCR date fragments
                            setattr(row, attr, val)
                    except ValueError:
                        pass

        # Only include rows that have a charge or description (skip blank/totals sometimes)
        if row.description or row.charge is not None:
            rows.append(row)

    return rows


def _match_description_to_cpt(description: str) -> tuple[str, str] | None:
    """Match a billing description to a CPT code using fuzzy patterns."""
    for pattern, cpt, label in DESCRIPTION_TO_CPT:
        if pattern.search(description):
            return (cpt, label)
    return None


# Column header keywords used by _parse_flat_columns
_COLUMN_HEADERS = re.compile(
    r"^(date|description|charge|amount|balance|pmt|adj|payment|service|procedure|code|cpt|hcpc|quantity|rev\s*code)",
    re.I,
)


def _parse_flat_columns(text: str) -> list[_TableRow]:
    """
    Parse Docling flat-text output where columns are read top-to-bottom.

    Docling sometimes produces output like:
      Date\n\n02-04-2026\n\n02-04-2026\n\nDescription\n\nOffice Visit; New Pt,\n\nLevel 4\n\n
      Charge\n\n696.00\n\nPmtlAdj\n\n180.54\n\nBalance\n\n515.46

    This reads each column header, collects the values below it, then
    reconstructs rows by zipping columns together.
    """
    # Split on double-newlines (Docling's section separator)
    # But also handle single newlines within multi-line descriptions
    raw_blocks = re.split(r"\n{2,}", text.strip())
    blocks = [b.strip() for b in raw_blocks if b.strip()]

    if not blocks:
        return []

    # Find column boundaries — blocks that look like column headers
    columns: dict[str, list[str]] = {}
    col_order: list[str] = []
    current_col: str = ""
    current_values: list[str] = []

    for block in blocks:
        # Is this a column header?
        if _COLUMN_HEADERS.match(block):
            # Save previous column
            if current_col and current_values:
                columns[current_col] = current_values
            current_col = block.lower().strip()
            if current_col not in col_order:
                col_order.append(current_col)
            current_values = []
        elif current_col:
            current_values.append(block)

    # Save last column
    if current_col and current_values:
        columns[current_col] = current_values

    if not columns:
        return []

    # Find the description column (may also be "service" or "procedure")
    desc_key = None
    charge_key = None
    balance_key = None
    code_key = None

    for key in columns:
        kl = key.lower()
        if any(k in kl for k in ["description", "service", "procedure"]):
            desc_key = key
        elif any(k in kl for k in ["charge", "amount", "billed"]):
            charge_key = key
        elif "balance" in kl:
            balance_key = key
        elif any(k in kl for k in ["code", "cpt", "hcpc"]):
            code_key = key

    if not desc_key and not code_key:
        return []

    # Description column may have multi-line values that got split.
    # Reconstruct: a description entry ends when we hit something that
    # looks like a number/amount (next row's value) or the next column.
    # For now, use the description column values as-is but join adjacent
    # non-numeric lines that clearly continue a description.
    desc_values = columns.get(desc_key or "", [])
    charge_values = columns.get(charge_key or "", [])
    balance_values = columns.get(balance_key or "", [])
    code_values = columns.get(code_key or "", [])

    # Merge description fragments: if a line is short, doesn't start with a
    # date, and isn't a number, it's probably a continuation of the previous
    _DATE_LIKE = re.compile(r"^\d{1,2}[-/]\d{1,2}")
    _NUMBER_LIKE = re.compile(r"^[\d,$.-]+$")
    _TOTAL_LIKE = re.compile(r"total|balance\s*due|your\s*balance|payment", re.I)

    merged_descs: list[str] = []
    for val in desc_values:
        # Skip totals/summary lines
        if _TOTAL_LIKE.search(val):
            continue
        if (merged_descs
                and not _DATE_LIKE.match(val)
                and not _NUMBER_LIKE.match(val)
                and len(val) < 60):
            # Continuation of previous description
            merged_descs[-1] = merged_descs[-1] + " " + val
        else:
            if not _NUMBER_LIKE.match(val):
                merged_descs.append(val)

    # Build rows by index
    num_rows = max(len(merged_descs), len(charge_values), len(code_values), 1)
    rows: list[_TableRow] = []
    for i in range(num_rows):
        row = _TableRow()
        if i < len(merged_descs):
            row.description = merged_descs[i]
        if i < len(code_values):
            m = CPT_PATTERN.search(code_values[i])
            if m and CPT_MIN <= int(m.group(1)) <= CPT_MAX:
                row.cpt_code = m.group(1)
        if i < len(charge_values):
            m = DOLLAR_BARE_PATTERN.search(charge_values[i])
            if m:
                try:
                    row.charge = float(m.group(1).replace(",", ""))
                except ValueError:
                    pass
        if i < len(balance_values):
            m = DOLLAR_BARE_PATTERN.search(balance_values[i])
            if m:
                try:
                    row.balance = float(m.group(1).replace(",", ""))
                except ValueError:
                    pass
        if row.description or row.cpt_code:
            rows.append(row)

    if rows:
        logger.info(f"Parsed {len(rows)} rows from flat-column text")

    return rows


def _parse_extracted_text(text: str, is_native: bool) -> ExtractedDocument:
    """
    Extract CPT, ICD-10, and dollar amounts from OCR text.

    Strategy:
    1. Try parsing structured Markdown tables first (Docling output)
    2. Try flat-column parsing (Docling flat text for summary bills)
    3. Match billing descriptions to CPT codes
    4. Fall back to regex extraction for explicit CPT codes
    5. Extract ICD-10 codes and dollar amounts
    """
    cpt_set: set[str] = set()
    charges: list[float] = []
    pairs: list[CodeWithAmount] = []

    def _process_table_rows(table_rows: list[_TableRow]) -> None:
        """Process parsed table rows — extract CPTs (explicit or from description)."""
        for row in table_rows:
            # Try explicit CPT code first
            if row.cpt_code:
                cpt_set.add(row.cpt_code)
                pairs.append(CodeWithAmount(
                    cpt_code=row.cpt_code,
                    amount=row.charge,
                    description=row.description,
                ))
                if row.charge is not None:
                    charges.append(row.charge)
                continue

            # Try matching description to CPT
            if row.description:
                match = _match_description_to_cpt(row.description)
                if match:
                    cpt_code, label = match
                    cpt_set.add(cpt_code)
                    pairs.append(CodeWithAmount(
                        cpt_code=cpt_code,
                        amount=row.charge,
                        description=row.description,
                    ))
                    logger.info(f"Mapped description '{row.description}' → CPT {cpt_code} ({label})")
                    if row.charge is not None:
                        charges.append(row.charge)
                    continue

            # Collect charges even if no CPT identified
            if row.charge is not None:
                charges.append(row.charge)

    # ── Phase 1: Parse structured Markdown tables ──
    table_rows = _parse_markdown_table(text)
    if table_rows:
        logger.info(f"Parsed {len(table_rows)} table rows from Markdown")
        _process_table_rows(table_rows)

    # ── Phase 1b: Try flat-column parsing (Docling flat text) ──
    if not table_rows:
        flat_rows = _parse_flat_columns(text)
        if flat_rows:
            _process_table_rows(flat_rows)
            table_rows = flat_rows  # so Phase 3 knows we found structure

    # ── Phase 2: Regex fallback for explicit CPT codes in text ──
    regex_cpts = {
        c for c in CPT_PATTERN.findall(text)
        if CPT_MIN <= int(c) <= CPT_MAX
    }
    # Filter out codes that are likely dollar amounts (5-digit charges)
    for c in regex_cpts:
        if re.search(rf"\$[\d,]*{c}", text):
            continue
        if c not in cpt_set:
            cpt_set.add(c)
            pairs.append(CodeWithAmount(cpt_code=c))

    # ── Phase 3: Description matching on full text (non-table) ──
    if not table_rows:
        # No tables found — try matching descriptions in raw text.
        # Join all lines into a single string, then also try multi-line
        # windows (OCR often splits "Office Visit; New Pt,\nLevel 4")
        lines = text.split("\n")
        # Try individual lines
        for line in lines:
            match = _match_description_to_cpt(line)
            if match:
                cpt_code, label = match
                if cpt_code not in cpt_set:
                    cpt_set.add(cpt_code)
                    pairs.append(CodeWithAmount(cpt_code=cpt_code, description=line.strip()))
                    logger.info(f"Mapped line '{line.strip()[:60]}' → CPT {cpt_code} ({label})")

        # Try joining consecutive line pairs (2-line window)
        for i in range(len(lines) - 1):
            joined = lines[i].strip() + " " + lines[i + 1].strip()
            match = _match_description_to_cpt(joined)
            if match:
                cpt_code, label = match
                if cpt_code not in cpt_set:
                    cpt_set.add(cpt_code)
                    pairs.append(CodeWithAmount(cpt_code=cpt_code, description=joined.strip()))
                    logger.info(f"Mapped joined lines '{joined.strip()[:60]}' → CPT {cpt_code} ({label})")

        # Try the entire text as one blob (catches descriptions split across many lines)
        full_blob = " ".join(l.strip() for l in lines if l.strip())
        match = _match_description_to_cpt(full_blob)
        if match:
            cpt_code, label = match
            if cpt_code not in cpt_set:
                cpt_set.add(cpt_code)
                pairs.append(CodeWithAmount(cpt_code=cpt_code, description=full_blob[:100]))
                logger.info(f"Mapped full text blob → CPT {cpt_code} ({label})")

    # ── Phase 4: ICD-10 codes ──
    icd10_codes = list(set(ICD10_PATTERN.findall(text)))

    # ── Phase 5: Dollar amounts (only if table parsing didn't find charges) ──
    if not charges:
        for d in DOLLAR_STRICT_PATTERN.findall(text):
            try:
                charges.append(float(d.replace(",", "")))
            except ValueError:
                pass
        if not charges:
            for d in DOLLAR_BARE_PATTERN.findall(text):
                try:
                    val = float(d.replace(",", ""))
                    if val < 1.0 or (1.0 <= val <= 12.9999 and re.search(rf"{re.escape(d)}\d{{2}}", text)):
                        continue
                    charges.append(val)
                except ValueError:
                    pass

    cpt_codes = list(cpt_set)

    logger.info(
        f"Extraction: {len(cpt_codes)} CPTs, {len(icd10_codes)} ICD-10s, "
        f"{len(charges)} amounts, {len(table_rows)} table rows, "
        f"{len(pairs)} paired codes"
    )

    return ExtractedDocument(
        raw_text=text,
        cpt_codes=cpt_codes,
        icd10_codes=icd10_codes,
        dollar_amounts=charges,
        is_native_pdf=is_native,
        code_amount_pairs=pairs,
    )
