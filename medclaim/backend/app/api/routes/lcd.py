from fastapi import APIRouter, Query
from app.services.lcd_service import lookup_lcd, get_medicare_rate, lookup_covered_codes, lookup_cpts_for_diagnosis

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


@router.get("/covered-codes")
async def lcd_covered_codes(
    cpt_code: str = Query(..., description="CPT procedure code e.g. 27447"),
    state: str = Query(..., description="Two letter state code e.g. TX"),
):
    """
    Physician helper: get all covered and noncovered ICD-10 codes
    for a CPT in a state, organized by group with standalone/combination rules.
    """
    result = lookup_covered_codes(cpt_code, state)

    if not result:
        return {
            "cptCode": cpt_code,
            "state": state,
            "lcdId": None,
            "lcdTitle": None,
            "articleId": None,
            "articleTitle": None,
            "groups": [],
            "standaloneCodes": [],
            "combinationGroups": [],
            "noncoveredCodes": [],
            "xx000Message": None,
            "message": f"No LCD data found for CPT {cpt_code} in {state}",
        }

    total_covered = sum(len(g["codes"]) for g in result.groups)
    return {
        "cptCode": cpt_code,
        "state": state,
        "lcdId": result.lcd_id,
        "lcdTitle": result.lcd_title,
        "articleId": result.article_id,
        "articleTitle": result.article_title,
        "groups": result.groups,
        "standaloneCodes": result.standalone_codes,
        "combinationGroups": result.combination_groups,
        "noncoveredCodes": result.noncovered_codes,
        "xx000Message": result.xx000_message,
        "message": (
            f"Found {total_covered} covered and "
            f"{len(result.noncovered_codes)} noncovered ICD-10 codes "
            f"for CPT {cpt_code} in {state}"
            f"{' under LCD ' + result.lcd_id if result.lcd_id else ''}"
            f"{' (' + str(len(result.standalone_codes)) + ' standalone)' if result.standalone_codes else ''}"
        ),
    }


@router.get("/cpts-for-diagnosis")
async def lcd_cpts_for_diagnosis(
    icd10_code: str = Query(..., description="ICD-10 diagnosis code e.g. M17.11"),
    state: str = Query(..., description="Two letter state code e.g. TX"),
):
    """
    Reverse lookup: ICD-10 + state → all CPT procedure codes that accept
    this diagnosis.  Useful for spotting overbilling, bundling issues,
    and physician planning.
    """
    result = lookup_cpts_for_diagnosis(icd10_code, state)

    if not result:
        return {
            "icd10Code": icd10_code,
            "state": state,
            "cpts": [],
            "message": f"No CPTs found for diagnosis {icd10_code} in {state}",
        }

    standalone_count = sum(1 for c in result.cpts if c.get("standalone"))
    combo_count = len(result.cpts) - standalone_count

    return {
        "icd10Code": icd10_code,
        "state": state,
        "cpts": result.cpts,
        "message": (
            f"Found {len(result.cpts)} CPT code(s) that accept "
            f"diagnosis {icd10_code} in {state}"
            f"{f' ({standalone_count} standalone, {combo_count} require combination)' if combo_count > 0 else ''}"
        ),
    }
