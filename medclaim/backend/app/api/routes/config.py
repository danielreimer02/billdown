"""
Site Config API — CRUD for admin-editable configuration.

Manages key-value config entries stored in the site_config table.
Used by the Site Maintenance UI to edit letter templates, charity care
state data, and other reference data without redeploying.

Admin-only: all endpoints require role=admin.
"""

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import text

from app.db.session import engine
from app.core.security import require_role

router = APIRouter()

_admin = Depends(require_role("admin"))


# ── Pydantic schemas ──

class ConfigEntry(BaseModel):
    key: str
    value: dict | list | str
    category: str
    label: Optional[str] = None
    description: Optional[str] = None

class ConfigUpdate(BaseModel):
    value: dict | list | str
    label: Optional[str] = None
    description: Optional[str] = None


# ── Endpoints ──

@router.get("", dependencies=[_admin])
async def list_configs(
    category: Optional[str] = Query(None, description="Filter by category"),
):
    """List all config entries, optionally filtered by category."""
    with engine.connect() as conn:
        if category:
            rows = conn.execute(
                text("SELECT id, key, value, category, label, description, updated_at FROM site_config WHERE category = :cat ORDER BY category, key"),
                {"cat": category},
            ).fetchall()
        else:
            rows = conn.execute(
                text("SELECT id, key, value, category, label, description, updated_at FROM site_config ORDER BY category, key"),
            ).fetchall()

        return [
            {
                "id": r.id,
                "key": r.key,
                "value": r.value,
                "category": r.category,
                "label": r.label,
                "description": r.description,
                "updatedAt": r.updated_at.isoformat() if r.updated_at else None,
            }
            for r in rows
        ]


@router.get("/categories", dependencies=[_admin])
async def list_categories():
    """List all distinct categories."""
    with engine.connect() as conn:
        rows = conn.execute(
            text("SELECT DISTINCT category, COUNT(*) as cnt FROM site_config GROUP BY category ORDER BY category"),
        ).fetchall()
        return [{"category": r.category, "count": r.cnt} for r in rows]


@router.get("/{key}", dependencies=[_admin])
async def get_config(key: str):
    """Get a single config entry by key."""
    with engine.connect() as conn:
        row = conn.execute(
            text("SELECT id, key, value, category, label, description, updated_at FROM site_config WHERE key = :key"),
            {"key": key},
        ).fetchone()

        if not row:
            raise HTTPException(status_code=404, detail=f"Config key '{key}' not found")

        return {
            "id": row.id,
            "key": row.key,
            "value": row.value,
            "category": row.category,
            "label": row.label,
            "description": row.description,
            "updatedAt": row.updated_at.isoformat() if row.updated_at else None,
        }


@router.post("", dependencies=[_admin])
async def create_config(entry: ConfigEntry):
    """Create a new config entry."""
    import json
    val = json.dumps(entry.value) if not isinstance(entry.value, str) else json.dumps(entry.value)

    with engine.begin() as conn:
        # Check for duplicate key
        existing = conn.execute(
            text("SELECT id FROM site_config WHERE key = :key"),
            {"key": entry.key},
        ).fetchone()
        if existing:
            raise HTTPException(status_code=409, detail=f"Config key '{entry.key}' already exists")

        conn.execute(
            text("""
                INSERT INTO site_config (key, value, category, label, description, updated_at)
                VALUES (:key, CAST(:value AS jsonb), :category, :label, :description, :updated_at)
            """),
            {
                "key": entry.key,
                "value": val,
                "category": entry.category,
                "label": entry.label,
                "description": entry.description,
                "updated_at": datetime.now(timezone.utc),
            },
        )

    return {"status": "created", "key": entry.key}


@router.put("/{key}", dependencies=[_admin])
async def update_config(key: str, update: ConfigUpdate):
    """Update an existing config entry's value."""
    import json
    val = json.dumps(update.value) if not isinstance(update.value, str) else json.dumps(update.value)

    with engine.begin() as conn:
        existing = conn.execute(
            text("SELECT id FROM site_config WHERE key = :key"),
            {"key": key},
        ).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail=f"Config key '{key}' not found")

        updates = ["value = CAST(:value AS jsonb)", "updated_at = :updated_at"]
        params: dict = {"key": key, "value": val, "updated_at": datetime.now(timezone.utc)}

        if update.label is not None:
            updates.append("label = :label")
            params["label"] = update.label
        if update.description is not None:
            updates.append("description = :description")
            params["description"] = update.description

        conn.execute(
            text(f"UPDATE site_config SET {', '.join(updates)} WHERE key = :key"),
            params,
        )

    return {"status": "updated", "key": key}


@router.delete("/{key}", dependencies=[_admin])
async def delete_config(key: str):
    """Delete a config entry."""
    with engine.begin() as conn:
        result = conn.execute(
            text("DELETE FROM site_config WHERE key = :key"),
            {"key": key},
        )
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail=f"Config key '{key}' not found")

    return {"status": "deleted", "key": key}
