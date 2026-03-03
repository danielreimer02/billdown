"""
Document processing service.

Strategy:
- Native PDFs → pdfplumber (free, perfect accuracy)
- Scanned/photos → AWS Textract (paid, handles images)

Never use Tesseract for medical billing —
one digit wrong on a CPT code breaks everything.
"""

import io
import re
import boto3
import pdfplumber
from pathlib import Path
from typing import Optional
from dataclasses import dataclass, field

from app.core.config import settings


@dataclass
class ExtractedDocument:
    raw_text: str
    cpt_codes: list[str] = field(default_factory=list)
    icd10_codes: list[str] = field(default_factory=list)
    dollar_amounts: list[float] = field(default_factory=list)
    is_native_pdf: bool = True


# ─────────────────────────────────────────
# ROUTING
# ─────────────────────────────────────────

def process_document(file_bytes: bytes, filename: str) -> ExtractedDocument:
    """
    Route to correct extractor based on file type.
    """
    suffix = Path(filename).suffix.lower()

    if suffix == ".pdf":
        if _is_native_pdf(file_bytes):
            text = _extract_native_pdf(file_bytes)
            return _parse_extracted_text(text, is_native=True)
        else:
            text = _extract_with_textract(file_bytes, "application/pdf")
            return _parse_extracted_text(text, is_native=False)

    elif suffix in [".jpg", ".jpeg", ".png"]:
        # Always use Textract for images — Tesseract accuracy too low
        media_type = "image/jpeg" if suffix in [".jpg", ".jpeg"] else "image/png"
        text = _extract_with_textract(file_bytes, media_type)
        return _parse_extracted_text(text, is_native=False)

    else:
        raise ValueError(f"Unsupported file type: {suffix}")


# ─────────────────────────────────────────
# PDF DETECTION
# ─────────────────────────────────────────

def _is_native_pdf(file_bytes: bytes) -> bool:
    """
    Native PDFs have selectable text.
    Scanned PDFs are just images inside a PDF wrapper.
    Try to extract text — if empty, it's scanned.
    """
    try:
        with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
            for page in pdf.pages[:2]:  # check first 2 pages only
                text = page.extract_text()
                if text and len(text.strip()) > 50:
                    return True
        return False
    except Exception:
        return False


# ─────────────────────────────────────────
# NATIVE PDF EXTRACTION
# ─────────────────────────────────────────

def _extract_native_pdf(file_bytes: bytes) -> str:
    """
    pdfplumber handles native PDFs perfectly.
    Also extracts tables — important for itemized bills.
    """
    full_text = []

    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        for page in pdf.pages:
            # Extract regular text
            text = page.extract_text()
            if text:
                full_text.append(text)

            # Extract tables (most bills are in table format)
            tables = page.extract_tables()
            for table in tables:
                for row in table:
                    if row:
                        row_text = " | ".join(
                            str(cell) for cell in row if cell
                        )
                        full_text.append(row_text)

    return "\n".join(full_text)


# ─────────────────────────────────────────
# TEXTRACT (scanned docs / photos)
# ─────────────────────────────────────────

def _extract_with_textract(file_bytes: bytes, media_type: str) -> str:
    """
    AWS Textract for scanned documents and photos.
    Only called when native PDF extraction returns empty.
    Cost: ~$1.50 per 1000 pages.
    """
    client = boto3.client(
        "textract",
        aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
        aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
        region_name=settings.AWS_REGION,
    )

    response = client.detect_document_text(
        Document={"Bytes": file_bytes}
    )

    lines = [
        block["Text"]
        for block in response["Blocks"]
        if block["BlockType"] == "LINE"
    ]

    return "\n".join(lines)


# ─────────────────────────────────────────
# CODE EXTRACTION
# Regex patterns for medical codes
# ─────────────────────────────────────────

# CPT codes: 5 digits, sometimes with modifiers (99214-25)
CPT_PATTERN = re.compile(r'\b(\d{5})(?:-\d{2})?\b')

# ICD-10: letter + 2 digits + optional decimal + more chars
# Examples: M17.11, J18.9, Z87.891
ICD10_PATTERN = re.compile(r'\b([A-Z]\d{2}(?:\.\d{1,4})?)\b')

# Dollar amounts
DOLLAR_PATTERN = re.compile(r'\$?([\d,]+\.\d{2})')

# Known CPT ranges to reduce false positives
CPT_MIN = 10000
CPT_MAX = 99499


def _parse_extracted_text(text: str, is_native: bool) -> ExtractedDocument:
    """
    Extract structured data from raw OCR text.
    """
    # CPT codes — filter to valid range
    cpt_candidates = CPT_PATTERN.findall(text)
    cpt_codes = list({
        c for c in cpt_candidates
        if CPT_MIN <= int(c) <= CPT_MAX
    })

    # ICD-10 codes
    icd10_codes = list(set(ICD10_PATTERN.findall(text)))

    # Dollar amounts
    dollar_strings = DOLLAR_PATTERN.findall(text)
    dollar_amounts = []
    for d in dollar_strings:
        try:
            dollar_amounts.append(float(d.replace(",", "")))
        except ValueError:
            pass

    return ExtractedDocument(
        raw_text=text,
        cpt_codes=cpt_codes,
        icd10_codes=icd10_codes,
        dollar_amounts=dollar_amounts,
        is_native_pdf=is_native,
    )
