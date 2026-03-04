"""
Analytics API — lightweight summary stats for the dashboard.
"""

from fastapi import APIRouter
from sqlalchemy import text
from app.db.session import engine

router = APIRouter()


@router.get("/summary")
async def analytics_summary():
    """Return aggregate stats for the analytics dashboard."""
    with engine.connect() as conn:
        # Table counts
        cases = conn.execute(text("SELECT COUNT(*) FROM cases")).scalar() or 0
        line_items = conn.execute(text("SELECT COUNT(*) FROM line_items")).scalar() or 0
        documents = conn.execute(text("SELECT COUNT(*) FROM documents")).scalar() or 0
        disputes = conn.execute(text("SELECT COUNT(*) FROM disputes")).scalar() or 0
        lcd = conn.execute(text("SELECT COUNT(*) FROM lcd")).scalar() or 0
        ptp = conn.execute(text("SELECT COUNT(*) FROM ncci_ptp")).scalar() or 0
        mue = conn.execute(text("SELECT COUNT(*) FROM ncci_mue")).scalar() or 0
        pfs = conn.execute(text("SELECT COUNT(*) FROM pfs_rvu")).scalar() or 0
        site_config = conn.execute(text("SELECT COUNT(*) FROM site_config")).scalar() or 0

        # Articles count (may not exist yet)
        try:
            articles = conn.execute(text("SELECT COUNT(*) FROM article")).scalar() or 0
        except Exception:
            articles = 0

        # Status breakdown
        status_rows = conn.execute(
            text("SELECT status, COUNT(*) as cnt FROM cases GROUP BY status ORDER BY cnt DESC")
        ).fetchall()
        statuses = [{"status": r.status or "unknown", "count": r.cnt} for r in status_rows]

        # Flag summary — parse JSON flags from line_items
        flag_rows = conn.execute(
            text("""
                SELECT
                    COALESCE(SUM(CASE WHEN li.ncci_violation = true THEN 1 ELSE 0 END), 0) as bundling,
                    COALESCE(SUM(CASE WHEN li.mue_violation = true THEN 1 ELSE 0 END), 0) as mue,
                    COALESCE(SUM(CASE WHEN li.medicare_rate IS NOT NULL
                        AND li.amount_billed IS NOT NULL
                        AND li.medicare_rate > 0
                        AND li.amount_billed > li.medicare_rate * 3
                        THEN 1 ELSE 0 END), 0) as price
                FROM line_items li
            """)
        ).fetchone()

        bundling = flag_rows.bundling if flag_rows else 0
        mue_flags = flag_rows.mue if flag_rows else 0
        price_flags = flag_rows.price if flag_rows else 0

        # Top CPT codes (join PFS for descriptions if cpt_description is empty)
        top_cpt_rows = conn.execute(
            text("""
                SELECT
                    li.cpt_code as code,
                    COALESCE(NULLIF(li.cpt_description, ''), p.description, '') as description,
                    COUNT(*) as cnt
                FROM line_items li
                LEFT JOIN LATERAL (
                    SELECT description FROM pfs_rvu WHERE hcpcs = li.cpt_code LIMIT 1
                ) p ON true
                WHERE li.cpt_code IS NOT NULL AND li.cpt_code != ''
                GROUP BY li.cpt_code, COALESCE(NULLIF(li.cpt_description, ''), p.description, '')
                ORDER BY cnt DESC
                LIMIT 10
            """)
        ).fetchall()
        top_cpts = [{"code": r.code, "description": r.description, "count": r.cnt} for r in top_cpt_rows]

    return {
        "cases": cases,
        "line_items": line_items,
        "documents": documents,
        "disputes": disputes,
        "lcd": lcd,
        "articles": articles,
        "ptp": ptp,
        "mue": mue,
        "pfs": pfs,
        "site_config": site_config,
        "statuses": statuses,
        "flag_summary": {
            "bundling": bundling,
            "mue": mue_flags,
            "price": price_flags,
            "total": bundling + mue_flags + price_flags,
        },
        "top_cpts": top_cpts,
    }
