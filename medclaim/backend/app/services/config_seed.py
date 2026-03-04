"""
Seed initial site_config entries on first startup.

Populates letter templates and other admin-editable config
so the Site Maintenance UI has content to work with immediately.
"""

import json
import logging
from datetime import datetime, timezone

from sqlalchemy import text
from app.db.session import engine

logger = logging.getLogger(__name__)


SEED_DATA = [
    # ── Letter Templates ──
    {
        "key": "letter.hospital_records_request",
        "category": "letter_templates",
        "label": "Hospital Records & FAP Request",
        "description": "Letter template sent to hospital billing department requesting itemized bill, medical records, and financial assistance policy. Variables: {{date}}, {{provider}}, {{billed_amount}}",
        "value": {
            "subject": "Request for Itemized Records & Financial Assistance Information",
            "body": "{{date}}\n\nTo: {{provider}} — Billing Department\nRe: Request for Itemized Records & Financial Assistance Information\n\nTo Whom It May Concern,\n\nI recently received a bill of {{billed_amount}} for services at your facility. Before making any payment, I'd like to request the following so I can better understand and review my charges.\n\nPursuant to my rights under the HIPAA Privacy Rule (45 CFR § 164.524), I am requesting access to my Protected Health Information (PHI), including complete medical records and billing records for this visit. I understand you are required to fulfill this request within 30 days.\n\nSpecifically, I am requesting:\n\n1. ITEMIZED BILL — A complete itemized statement showing every CPT/HCPCS code, ICD-10 diagnosis code, number of units, and the charge for each line item. A summary statement is not sufficient for my review.\n\n2. MEDICAL RECORDS — Complete medical records for this visit, including physician notes, procedure records, lab results, and any imaging reports.\n\n3. FINANCIAL ASSISTANCE POLICY (FAP) — A copy of your facility's Financial Assistance Policy and the application form. Under Section 501(r) of the Internal Revenue Code, nonprofit hospitals are required to provide this information and to screen patients for eligibility before initiating collections.\n\n4. PAYMENT HOLD — I respectfully request that this account be placed on hold and that no collections activity, credit reporting, or extraordinary collection actions be taken while I review these documents and complete the financial assistance application process. Federal regulations (26 CFR § 1.501(r)-6) require reasonable efforts to determine FAP eligibility before pursuing collections.\n\nI appreciate your help and look forward to resolving this.\n\nSincerely,\n{{patient_name}}\n{{patient_address}}\n{{patient_contact}}",
            "variables": ["date", "provider", "billed_amount", "patient_name", "patient_address", "patient_contact"],
        },
    },
    {
        "key": "letter.insurance_eob_request",
        "category": "letter_templates",
        "label": "Insurance EOB Request",
        "description": "Letter template to insurance company requesting Explanation of Benefits. Variables: {{date}}, {{provider}}, {{member_id}}, {{group_number}}",
        "value": {
            "subject": "Request for Explanation of Benefits (EOB)",
            "body": "{{date}}\n\nTo: {{insurance_company}} — Member Services\nRe: Request for Explanation of Benefits (EOB)\nMember ID: {{member_id}}\nGroup #: {{group_number}}\n\nTo Whom It May Concern,\n\nI am writing to request a complete Explanation of Benefits (EOB) for services I received at {{provider}}. Specifically, I need:\n\n1. A copy of the EOB for all claims submitted by {{provider}} on my behalf, showing:\n   - What was billed by the provider\n   - What was allowed under my plan\n   - What was paid by insurance\n   - What was denied and the reason code for each denial\n   - My remaining patient responsibility\n\n2. If any claims were denied, I would also like:\n   - The specific denial reason codes (e.g., CO-4, CO-97, PR-1)\n   - Instructions on how to file an appeal for any denied claims\n   - The deadline for filing an appeal\n\nIf no claims were submitted by this provider, please confirm that in writing so I can follow up with the provider directly.\n\nThank you for your assistance.\n\nSincerely,\n{{patient_name}}\n{{patient_address}}\n{{member_id}}\n{{patient_contact}}",
            "variables": ["date", "insurance_company", "provider", "member_id", "group_number", "patient_name", "patient_address", "patient_contact"],
        },
    },
    {
        "key": "letter.billing_dispute",
        "category": "letter_templates",
        "label": "Billing Dispute Letter",
        "description": "Generic billing dispute letter citing specific errors found by analysis. Variables: {{date}}, {{provider}}, {{dispute_details}}, {{requested_adjustment}}",
        "value": {
            "subject": "Formal Billing Dispute — Request for Adjustment",
            "body": "{{date}}\n\nTo: {{provider}} — Billing Department\nRe: Formal Billing Dispute\n\nTo Whom It May Concern,\n\nI am writing to formally dispute charges on my recent bill. After careful review using the Medicare Physician Fee Schedule and NCCI bundling guidelines, I have identified the following issues:\n\n{{dispute_details}}\n\nBased on my analysis, I am requesting an adjustment of {{requested_adjustment}}.\n\nPlease review these items and provide a written response within 30 days. I have placed this account on hold pending your review and request that no collections activity be initiated during this time.\n\nSincerely,\n{{patient_name}}\n{{patient_address}}\n{{patient_contact}}",
            "variables": ["date", "provider", "dispute_details", "requested_adjustment", "patient_name", "patient_address", "patient_contact"],
        },
    },
    # ── Reference Data ──
    {
        "key": "reference.state_aliases",
        "category": "reference_data",
        "label": "State Abbreviation Aliases",
        "description": "Maps state names and common aliases to standard 2-letter abbreviations. Used by LCD lookup for state resolution.",
        "value": {
            "USVI": ["VI"],
            "AS": ["AS"],
            "GU": ["GU"],
            "MP": ["MP"],
            "PR": ["PR"],
        },
    },
    {
        "key": "reference.denial_reason_codes",
        "category": "reference_data",
        "label": "Common Denial Reason Codes",
        "description": "Lookup table for insurance denial reason codes (CARC/RARC) with plain-English explanations.",
        "value": {
            "CO-4": {"label": "Modifier Required", "description": "The procedure code is inconsistent with the modifier used. The claim needs a different or additional modifier.", "action": "Review the modifier and resubmit with correct modifier."},
            "CO-16": {"label": "Missing Information", "description": "Claim/service lacks information or has submission errors.", "action": "Review the claim for missing fields and resubmit."},
            "CO-18": {"label": "Duplicate Claim", "description": "This is an exact duplicate of a claim already processed.", "action": "Check if original claim was paid. If not, appeal with proof."},
            "CO-97": {"label": "Bundled Procedure", "description": "Payment for this procedure is included in the allowance for another procedure that has already been adjudicated.", "action": "Check NCCI edits. If modifier 59/XE/XS/XP/XU is appropriate, appeal with modifier."},
            "CO-236": {"label": "No Prior Authorization", "description": "This procedure requires prior authorization that was not obtained.", "action": "Check if retro-auth is available. File appeal with medical necessity documentation."},
            "PR-1": {"label": "Patient Deductible", "description": "Deductible amount. This is the patient's responsibility under their plan.", "action": "Verify deductible status with insurance. Check if amount is correct."},
            "PR-2": {"label": "Patient Coinsurance", "description": "Coinsurance amount. Patient's share after deductible.", "action": "Verify coinsurance percentage matches plan terms."},
            "PR-3": {"label": "Patient Copay", "description": "Co-payment amount.", "action": "Verify copay matches plan terms for service type."},
        },
    },
    # ── Site Settings ──
    {
        "key": "settings.conversion_factor",
        "category": "site_settings",
        "label": "CMS Conversion Factor",
        "description": "Current Medicare Physician Fee Schedule conversion factor (CMS CF). Updated annually by CMS.",
        "value": {"year": 2025, "amount": 33.4009, "source": "CMS Final Rule CY2025"},
    },
    {
        "key": "settings.rand_study_citation",
        "category": "site_settings",
        "label": "RAND Hospital Price Study Citation",
        "description": "Citation for the RAND Corporation study on hospital pricing relative to Medicare. Used in dispute analysis.",
        "value": {
            "title": "Prices Paid to Hospitals by Private Health Plans: Findings from Round 4 of an Employer-Led Transparency Initiative",
            "author": "RAND Corporation",
            "year": 2024,
            "url": "https://www.rand.org/pubs/research_reports/RRA1144-1.html",
            "key_finding": "Hospitals charge private insurers an average of 254% of Medicare rates nationally. Some hospitals exceed 400% of Medicare.",
            "negotiation_tip": "Most hospitals will negotiate to 2–3× Medicare rates when patients ask directly and cite this research.",
        },
    },
]


def seed_site_config():
    """Insert seed config entries if the site_config table is empty."""
    try:
        with engine.begin() as conn:
            count = conn.execute(text("SELECT COUNT(*) FROM site_config")).scalar()
            if count and count > 0:
                logger.info(f"site_config already has {count} entries — skipping seed")
                return

            for entry in SEED_DATA:
                conn.execute(
                    text("""
                        INSERT INTO site_config (key, value, category, label, description, updated_at)
                        VALUES (:key, CAST(:value AS jsonb), :category, :label, :description, :updated_at)
                        ON CONFLICT (key) DO NOTHING
                    """),
                    {
                        "key": entry["key"],
                        "value": json.dumps(entry["value"]),
                        "category": entry["category"],
                        "label": entry["label"],
                        "description": entry["description"],
                        "updated_at": datetime.now(timezone.utc),
                    },
                )

            logger.info(f"Seeded {len(SEED_DATA)} site_config entries")
    except Exception as e:
        logger.error(f"Failed to seed site_config: {e}")
