"""
Site Analytics API — tracks page views and provides analytics summaries.
Includes a public endpoint for recording views and admin-only endpoints for reading stats.
"""

from fastapi import APIRouter, Depends, Request
from sqlalchemy import text
from app.db.session import engine
from app.core.security import require_role

router = APIRouter()

_admin = Depends(require_role("admin"))


# ── Public: Record a page view ──

@router.post("/pageview")
async def record_pageview(request: Request):
    """Record an anonymous page view. Called by the frontend on navigation."""
    try:
        body = await request.json()
    except Exception:
        body = {}

    path = body.get("path", "")
    referrer = body.get("referrer", "")
    session_id = body.get("session_id", "")

    ip = request.headers.get("x-forwarded-for", request.client.host if request.client else "unknown")
    if "," in ip:
        ip = ip.split(",")[0].strip()
    ua = request.headers.get("user-agent", "")

    # Extract user_id from token if present (optional)
    user_id = None
    auth = request.headers.get("authorization", "")
    if auth.startswith("Bearer "):
        try:
            from app.core.security import decode_token
            payload = decode_token(auth.split(" ")[1])
            user_id = payload.get("sub")
        except Exception:
            pass

    with engine.begin() as conn:
        conn.execute(
            text("""
                INSERT INTO page_views (id, path, referrer, user_agent, ip_address, session_id, user_id, created_at)
                VALUES (gen_random_uuid()::text, :path, :referrer, :ua, :ip, :session_id, :user_id, NOW())
            """),
            {"path": path, "referrer": referrer, "ua": ua, "ip": ip,
             "session_id": session_id, "user_id": user_id},
        )

    return {"ok": True}


# ── Admin: Dashboard summary ──

@router.get("/summary", dependencies=[_admin])
async def site_analytics_summary():
    """Aggregate site analytics for the admin dashboard."""
    with engine.connect() as conn:
        # Total page views
        total_views = conn.execute(text("SELECT COUNT(*) FROM page_views")).scalar() or 0

        # Unique visitors (by session_id)
        unique_visitors = conn.execute(
            text("SELECT COUNT(DISTINCT session_id) FROM page_views WHERE session_id IS NOT NULL AND session_id != ''")
        ).scalar() or 0

        # Authenticated users
        auth_users = conn.execute(
            text("SELECT COUNT(DISTINCT user_id) FROM page_views WHERE user_id IS NOT NULL")
        ).scalar() or 0

        # Views today
        views_today = conn.execute(
            text("SELECT COUNT(*) FROM page_views WHERE created_at >= CURRENT_DATE")
        ).scalar() or 0

        # Views last 7 days
        views_7d = conn.execute(
            text("SELECT COUNT(*) FROM page_views WHERE created_at >= NOW() - INTERVAL '7 days'")
        ).scalar() or 0

        # Views last 30 days
        views_30d = conn.execute(
            text("SELECT COUNT(*) FROM page_views WHERE created_at >= NOW() - INTERVAL '30 days'")
        ).scalar() or 0

        # Top pages (last 30 days)
        top_pages_rows = conn.execute(
            text("""
                SELECT path, COUNT(*) as views, COUNT(DISTINCT session_id) as unique_visitors
                FROM page_views
                WHERE created_at >= NOW() - INTERVAL '30 days'
                GROUP BY path
                ORDER BY views DESC
                LIMIT 20
            """)
        ).fetchall()
        top_pages = [{"path": r.path, "views": r.views, "unique_visitors": r.unique_visitors} for r in top_pages_rows]

        # Top referrers (last 30 days)
        referrer_rows = conn.execute(
            text("""
                SELECT referrer, COUNT(*) as count
                FROM page_views
                WHERE created_at >= NOW() - INTERVAL '30 days'
                  AND referrer IS NOT NULL AND referrer != '' AND referrer != 'null'
                GROUP BY referrer
                ORDER BY count DESC
                LIMIT 20
            """)
        ).fetchall()
        top_referrers = [{"referrer": r.referrer, "count": r.count} for r in referrer_rows]

        # Daily views (last 30 days) — for trend chart
        daily_rows = conn.execute(
            text("""
                SELECT DATE(created_at) as day, COUNT(*) as views, COUNT(DISTINCT session_id) as visitors
                FROM page_views
                WHERE created_at >= NOW() - INTERVAL '30 days'
                GROUP BY DATE(created_at)
                ORDER BY day
            """)
        ).fetchall()
        daily_views = [{"day": str(r.day), "views": r.views, "visitors": r.visitors} for r in daily_rows]

        # Hourly distribution (all time) — for usage pattern
        hourly_rows = conn.execute(
            text("""
                SELECT EXTRACT(HOUR FROM created_at)::int as hour, COUNT(*) as views
                FROM page_views
                GROUP BY EXTRACT(HOUR FROM created_at)
                ORDER BY hour
            """)
        ).fetchall()
        hourly_distribution = [{"hour": r.hour, "views": r.views} for r in hourly_rows]

        # Recent visitors (last 20)
        recent_rows = conn.execute(
            text("""
                SELECT pv.path, pv.referrer, pv.ip_address, pv.user_agent, pv.session_id,
                       pv.created_at, u.email as user_email
                FROM page_views pv
                LEFT JOIN users u ON pv.user_id = u.id
                ORDER BY pv.created_at DESC
                LIMIT 20
            """)
        ).fetchall()
        recent_visitors = [
            {
                "path": r.path,
                "referrer": r.referrer,
                "ip": r.ip_address,
                "user_agent": r.user_agent[:80] if r.user_agent else "",
                "session_id": (r.session_id[:8] + "…") if r.session_id and len(r.session_id) > 8 else r.session_id,
                "user_email": r.user_email,
                "time": r.created_at.isoformat() if r.created_at else "",
            }
            for r in recent_rows
        ]

    return {
        "total_views": total_views,
        "unique_visitors": unique_visitors,
        "auth_users": auth_users,
        "views_today": views_today,
        "views_7d": views_7d,
        "views_30d": views_30d,
        "top_pages": top_pages,
        "top_referrers": top_referrers,
        "daily_views": daily_views,
        "hourly_distribution": hourly_distribution,
        "recent_visitors": recent_visitors,
    }
