from fastapi import APIRouter, Query
from typing import Optional
from sqlalchemy import text
from app.services.lcd_service import lookup_lcd, get_medicare_rate, lookup_covered_codes, lookup_cpts_for_diagnosis
from app.db.session import engine

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


# ─────────────────────────────────────────
# LCD EXPLORER — browse / search endpoints
# ─────────────────────────────────────────

@router.get("/explorer/lcds")
async def explorer_lcds(
    search: Optional[str] = Query(None, description="Search by title or LCD ID"),
    status: Optional[str] = Query(None, description="Filter by status e.g. 'Future'"),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(50, ge=1, le=200, description="Results per page"),
):
    """
    Browse all LCDs with search and pagination.
    Returns the latest version of each LCD.
    """
    try:
        with engine.connect() as conn:
            conditions = ["1=1"]
            params: dict = {"limit": page_size, "offset": (page - 1) * page_size}

            if search:
                conditions.append(
                    "(CAST(l.lcd_id AS TEXT) LIKE :search OR LOWER(l.title) LIKE :search_lower)"
                )
                params["search"] = f"%{search}%"
                params["search_lower"] = f"%{search.lower()}%"

            if status:
                conditions.append("LOWER(l.status) = :status")
                params["status"] = status.lower()

            where = " AND ".join(conditions)

            # Count
            count_q = f"""
                SELECT COUNT(DISTINCT l.lcd_id) FROM lcd l WHERE {where}
            """
            total = conn.execute(text(count_q), params).scalar() or 0

            # Fetch latest version of each LCD
            data_q = f"""
                SELECT l.lcd_id, l.lcd_version, l.title, l.status,
                       l.display_id, l.determination_number, l.last_updated
                FROM lcd l
                INNER JOIN (
                    SELECT lcd_id, MAX(lcd_version) AS max_ver
                    FROM lcd
                    WHERE {where}
                    GROUP BY lcd_id
                ) latest ON l.lcd_id = latest.lcd_id AND l.lcd_version = latest.max_ver
                ORDER BY l.lcd_id DESC
                LIMIT :limit OFFSET :offset
            """
            rows = conn.execute(text(data_q), params).fetchall()

            return {
                "total": total,
                "page": page,
                "pageSize": page_size,
                "totalPages": (total + page_size - 1) // page_size,
                "lcds": [
                    {
                        "lcdId": r.lcd_id,
                        "version": r.lcd_version,
                        "title": r.title,
                        "status": r.status,
                        "displayId": r.display_id,
                        "determinationNumber": r.determination_number,
                        "lastUpdated": str(r.last_updated) if r.last_updated else None,
                    }
                    for r in rows
                ],
            }
    except Exception as e:
        return {"total": 0, "page": 1, "pageSize": page_size, "totalPages": 0, "lcds": [], "error": str(e)}


@router.get("/explorer/lcd/{lcd_id}")
async def explorer_lcd_detail(lcd_id: int):
    """
    Get full details of an LCD by ID, including linked articles and CPT codes.
    """
    try:
        with engine.connect() as conn:
            # LCD info (latest version)
            lcd_row = conn.execute(
                text("""
                    SELECT lcd_id, lcd_version, title, status, display_id,
                           determination_number, last_updated
                    FROM lcd
                    WHERE lcd_id = :lcd_id
                    ORDER BY lcd_version DESC
                    LIMIT 1
                """),
                {"lcd_id": lcd_id},
            ).first()

            if not lcd_row:
                return {"error": f"LCD {lcd_id} not found"}

            # Linked articles
            articles = conn.execute(
                text("""
                    SELECT DISTINCT a.article_id, a.article_version, a.title, a.status
                    FROM lcd_related_documents rd
                    JOIN article a ON a.article_id = rd.r_article_id
                        AND a.article_version = rd.r_article_version
                    WHERE rd.lcd_id = :lcd_id AND rd.lcd_version = :lcd_version
                """),
                {"lcd_id": lcd_row.lcd_id, "lcd_version": lcd_row.lcd_version},
            ).fetchall()

            # CPT codes from linked articles
            cpt_codes = []
            for art in articles:
                cpts = conn.execute(
                    text("""
                        SELECT hcpc_code_id, short_description, long_description
                        FROM article_x_hcpc_code
                        WHERE article_id = :aid AND article_version = :aver
                        ORDER BY hcpc_code_id
                    """),
                    {"aid": art.article_id, "aver": art.article_version},
                ).fetchall()
                for c in cpts:
                    cpt_codes.append({
                        "cptCode": c.hcpc_code_id,
                        "shortDescription": c.short_description,
                        "longDescription": c.long_description,
                        "articleId": art.article_id,
                    })

            # Contractors / jurisdictions
            jurisdictions = conn.execute(
                text("""
                    SELECT DISTINCT sl.state_abbrev, sl.description AS state_name
                    FROM lcd_related_documents rd
                    JOIN article_x_contractor ac
                        ON ac.article_id = rd.r_article_id
                        AND ac.article_version = rd.r_article_version
                    JOIN contractor_jurisdiction cj
                        ON cj.contractor_id = ac.contractor_id
                        AND cj.contractor_type_id = ac.contractor_type_id
                        AND cj.contractor_version = ac.contractor_version
                    JOIN state_lookup sl ON sl.state_id = cj.state_id
                    WHERE rd.lcd_id = :lcd_id AND rd.lcd_version = :lcd_version
                    ORDER BY sl.state_abbrev
                """),
                {"lcd_id": lcd_row.lcd_id, "lcd_version": lcd_row.lcd_version},
            ).fetchall()

            return {
                "lcd": {
                    "lcdId": lcd_row.lcd_id,
                    "version": lcd_row.lcd_version,
                    "title": lcd_row.title,
                    "status": lcd_row.status,
                    "displayId": lcd_row.display_id,
                    "determinationNumber": lcd_row.determination_number,
                    "lastUpdated": str(lcd_row.last_updated) if lcd_row.last_updated else None,
                },
                "articles": [
                    {
                        "articleId": a.article_id,
                        "version": a.article_version,
                        "title": a.title,
                        "status": a.status,
                    }
                    for a in articles
                ],
                "cptCodes": cpt_codes,
                "states": [
                    {"abbrev": j.state_abbrev, "name": j.state_name}
                    for j in jurisdictions
                ],
            }
    except Exception as e:
        return {"error": str(e)}


@router.get("/explorer/articles")
async def explorer_articles(
    search: Optional[str] = Query(None, description="Search by title or article ID"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
):
    """Browse articles with search and pagination."""
    try:
        with engine.connect() as conn:
            conditions = ["1=1"]
            params: dict = {"limit": page_size, "offset": (page - 1) * page_size}

            if search:
                conditions.append(
                    "(CAST(a.article_id AS TEXT) LIKE :search OR LOWER(a.title) LIKE :search_lower)"
                )
                params["search"] = f"%{search}%"
                params["search_lower"] = f"%{search.lower()}%"

            where = " AND ".join(conditions)

            total = conn.execute(
                text(f"SELECT COUNT(DISTINCT a.article_id) FROM article a WHERE {where}"),
                params,
            ).scalar() or 0

            rows = conn.execute(
                text(f"""
                    SELECT a.article_id, a.article_version, a.title, a.status, a.last_updated
                    FROM article a
                    INNER JOIN (
                        SELECT article_id, MAX(article_version) AS max_ver
                        FROM article
                        WHERE {where}
                        GROUP BY article_id
                    ) latest ON a.article_id = latest.article_id AND a.article_version = latest.max_ver
                    ORDER BY a.article_id DESC
                    LIMIT :limit OFFSET :offset
                """),
                params,
            ).fetchall()

            return {
                "total": total,
                "page": page,
                "pageSize": page_size,
                "totalPages": (total + page_size - 1) // page_size,
                "articles": [
                    {
                        "articleId": r.article_id,
                        "version": r.article_version,
                        "title": r.title,
                        "status": r.status,
                        "lastUpdated": str(r.last_updated) if r.last_updated else None,
                    }
                    for r in rows
                ],
            }
    except Exception as e:
        return {"total": 0, "page": 1, "pageSize": page_size, "totalPages": 0, "articles": [], "error": str(e)}


@router.get("/explorer/article/{article_id}")
async def explorer_article_detail(article_id: int):
    """Get full article detail including CPT codes and ICD-10 mappings."""
    try:
        with engine.connect() as conn:
            art_row = conn.execute(
                text("""
                    SELECT article_id, article_version, title, status, last_updated
                    FROM article
                    WHERE article_id = :aid
                    ORDER BY article_version DESC
                    LIMIT 1
                """),
                {"aid": article_id},
            ).first()

            if not art_row:
                return {"error": f"Article {article_id} not found"}

            aid = art_row.article_id
            aver = art_row.article_version

            # CPT codes
            cpts = conn.execute(
                text("""
                    SELECT hcpc_code_id, short_description, long_description
                    FROM article_x_hcpc_code
                    WHERE article_id = :aid AND article_version = :aver
                    ORDER BY hcpc_code_id
                """),
                {"aid": aid, "aver": aver},
            ).fetchall()

            # Covered ICD-10 codes
            covered = conn.execute(
                text("""
                    SELECT icd10_code_id, icd10_covered_group, description
                    FROM article_x_icd10_covered
                    WHERE article_id = :aid AND article_version = :aver
                    ORDER BY icd10_covered_group, icd10_code_id
                """),
                {"aid": aid, "aver": aver},
            ).fetchall()

            # Covered groups
            groups = conn.execute(
                text("""
                    SELECT icd10_covered_group, paragraph
                    FROM article_x_icd10_covered_group
                    WHERE article_id = :aid AND article_version = :aver
                    ORDER BY icd10_covered_group
                """),
                {"aid": aid, "aver": aver},
            ).fetchall()

            # Noncovered ICD-10 codes
            noncovered = conn.execute(
                text("""
                    SELECT icd10_code_id, icd10_noncovered_group, description
                    FROM article_x_icd10_noncovered
                    WHERE article_id = :aid AND article_version = :aver
                    ORDER BY icd10_noncovered_group, icd10_code_id
                """),
                {"aid": aid, "aver": aver},
            ).fetchall()

            # Linked LCDs
            lcds = conn.execute(
                text("""
                    SELECT DISTINCT l.lcd_id, l.title, l.status
                    FROM lcd_related_documents rd
                    JOIN lcd l ON l.lcd_id = rd.lcd_id AND l.lcd_version = rd.lcd_version
                    WHERE rd.r_article_id = :aid AND rd.r_article_version = :aver
                """),
                {"aid": aid, "aver": aver},
            ).fetchall()

            return {
                "article": {
                    "articleId": art_row.article_id,
                    "version": art_row.article_version,
                    "title": art_row.title,
                    "status": art_row.status,
                    "lastUpdated": str(art_row.last_updated) if art_row.last_updated else None,
                },
                "cptCodes": [
                    {"cptCode": c.hcpc_code_id, "shortDescription": c.short_description, "longDescription": c.long_description}
                    for c in cpts
                ],
                "coveredCodes": [
                    {"icd10Code": c.icd10_code_id, "group": c.icd10_covered_group, "description": c.description}
                    for c in covered
                ],
                "coveredGroups": [
                    {"group": g.icd10_covered_group, "paragraph": g.paragraph}
                    for g in groups
                ],
                "noncoveredCodes": [
                    {"icd10Code": c.icd10_code_id, "group": c.icd10_noncovered_group, "description": c.description}
                    for c in noncovered
                ],
                "linkedLcds": [
                    {"lcdId": l.lcd_id, "title": l.title, "status": l.status}
                    for l in lcds
                ],
            }
    except Exception as e:
        return {"error": str(e)}
