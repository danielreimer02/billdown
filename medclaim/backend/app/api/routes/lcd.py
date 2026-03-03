from fastapi import APIRouter, Query
from app.services.lcd_service import lookup_lcd, get_medicare_rate

router = APIRouter()


@router.get("/lookup")
async def lcd_lookup(
    cpt_code: str = Query(..., description="CPT procedure code e.g. 27447"),
    icd10_code: str = Query(..., description="ICD-10 diagnosis code e.g. M17.11"),
    state: str = Query(..., description="Two letter state code e.g. TX"),
):
    """
    Core LCD lookup endpoint.

    Used by:
    - Patient: "was my denial wrongful?"
    - Physician: "what do I need to document?"
    - Prior auth appeal: "what LCD do I cite?"

    Returns rich data including article references, ICD-10 descriptions,
    and a sample of covered ICD-10 codes for the same CPT.
    """
    coverage = await lookup_lcd(cpt_code, icd10_code, state)
    medicare_rate = await get_medicare_rate(cpt_code, state)

    if not coverage:
        return {
            "covered": False,
            "lcdId": None,
            "title": None,
            "articleId": None,
            "articleTitle": None,
            "cptCode": cpt_code,
            "icd10Code": icd10_code,
            "icd10Description": None,
            "medicareRate": medicare_rate,
            "coveredIcd10Codes": [],
            "documentationCriteria": [],
            "source": "none",
            "message": f"No LCD found for CPT {cpt_code} with diagnosis {icd10_code} in {state}",
        }

    return {
        "covered": coverage.covered,
        "lcdId": coverage.lcd_id,
        "title": coverage.lcd_title,
        "articleId": coverage.article_id,
        "articleTitle": coverage.article_title,
        "cptCode": cpt_code,
        "icd10Code": icd10_code,
        "icd10Description": coverage.icd10_description,
        "medicareRate": medicare_rate,
        "coveredIcd10Codes": coverage.covered_icd10_codes,
        "documentationCriteria": coverage.documentation_criteria,
        "source": coverage.source,
        "message": (
            f"CPT {cpt_code} is {'COVERED' if coverage.covered else 'NOT COVERED'} "
            f"by Medicare under LCD {coverage.lcd_id} "
            f"for diagnosis {icd10_code}"
            f"{' in ' + state if state else ''}. "
            f"{'Medicare rate: $' + str(medicare_rate) if medicare_rate else ''}"
        ),
    }
