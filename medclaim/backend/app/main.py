import logging
from contextlib import asynccontextmanager

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(name)s - %(message)s")

from sqlalchemy import text
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.api.routes import cases, documents, lcd, auth, billing
from app.db.session import engine, Base
from app.services.lcd_etl import load_lcd_data, is_lcd_data_loaded
from app.services.billing_etl import load_all_billing_data

# Import models so Base.metadata knows about all tables
import app.models.models  # noqa: F401
import app.models.lcd_models  # noqa: F401
import app.models.billing_models  # noqa: F401

from app.core.audit import audit_middleware

logger = logging.getLogger(__name__)


def _sync_pg_enums():
    """Ensure PostgreSQL enum types contain every value in the Python enums.

    `create_all` only creates enum types once — it never adds new values.
    This idempotent helper fills that gap so we can expand enums freely in
    models.py without hand-writing Alembic migrations.
    """
    from app.models.models import DocumentType, DisputeType, CaseStatus, CaseType, UserRole

    pg_enum_map = {
        "documenttype": DocumentType,
        "disputetype": DisputeType,
        "casestatus": CaseStatus,
        "casetype": CaseType,
        "userrole": UserRole,
    }

    with engine.begin() as conn:
        for pg_name, py_enum in pg_enum_map.items():
            # Fetch existing labels from the PG enum
            rows = conn.execute(
                text(
                    "SELECT e.enumlabel FROM pg_enum e "
                    "JOIN pg_type t ON e.enumtypid = t.oid "
                    "WHERE t.typname = :name"
                ),
                {"name": pg_name},
            ).fetchall()
            existing = {r[0] for r in rows}

            for member in py_enum:
                if member.value not in existing:
                    # ALTER TYPE ... ADD VALUE cannot use parameter binding;
                    # the value comes from our own enum, not user input.
                    stmt = f"ALTER TYPE {pg_name} ADD VALUE IF NOT EXISTS '{member.value}'"
                    conn.execute(text(stmt))
                    logger.info("Added '%s' to PG enum %s", member.value, pg_name)


def _rename_columns():
    """Rename columns that were renamed in models (idempotent)."""
    from sqlalchemy import inspect as sa_inspect
    inspector = sa_inspect(engine)

    renames = [
        # (table, old_name, new_name)
        ("cases", "session_id", "guest_id"),
    ]

    with engine.begin() as conn:
        for table_name, old_name, new_name in renames:
            if not inspector.has_table(table_name):
                continue
            existing = {c["name"] for c in inspector.get_columns(table_name)}
            if old_name in existing and new_name not in existing:
                stmt = f'ALTER TABLE "{table_name}" RENAME COLUMN "{old_name}" TO "{new_name}"'
                logger.info("Renaming column: %s.%s → %s", table_name, old_name, new_name)
                conn.execute(text(stmt))


def _sync_missing_columns():
    """Add any columns that exist in SQLAlchemy models but not yet in Postgres.

    `create_all` only creates NEW tables — it never alters existing ones.
    This idempotent helper inspects each model's columns against the actual
    DB schema and issues ALTER TABLE ADD COLUMN for anything missing.
    """
    from sqlalchemy import inspect as sa_inspect
    import enum

    inspector = sa_inspect(engine)

    with engine.begin() as conn:
        for table in Base.metadata.sorted_tables:
            if not inspector.has_table(table.name):
                continue  # create_all will handle brand-new tables

            existing_cols = {c["name"] for c in inspector.get_columns(table.name)}

            for col in table.columns:
                if col.name in existing_cols:
                    continue

                # Build the column type string
                col_type = col.type.compile(dialect=engine.dialect)

                # Handle defaults
                default_clause = ""
                if col.default is not None:
                    default_val = col.default.arg
                    if callable(default_val):
                        default_clause = ""  # skip callables (like uuid4)
                    elif isinstance(default_val, enum.Enum):
                        # Enum members — use .value not repr
                        default_clause = f" DEFAULT '{default_val.value}'"
                    elif isinstance(default_val, str):
                        default_clause = f" DEFAULT '{default_val}'"
                    else:
                        default_clause = f" DEFAULT {default_val}"
                elif col.server_default is not None:
                    default_clause = f" DEFAULT {col.server_default.arg.text}"

                nullable = "" if col.nullable else " NOT NULL"
                # Can't add NOT NULL without a default on existing rows
                if not col.nullable and not default_clause:
                    # Add with a safe default first, then they can backfill
                    if "VARCHAR" in col_type.upper() or "TEXT" in col_type.upper():
                        default_clause = " DEFAULT ''"
                    elif "INT" in col_type.upper() or "FLOAT" in col_type.upper() or "NUMERIC" in col_type.upper():
                        default_clause = " DEFAULT 0"
                    elif "type" in col_type.lower():
                        # Likely an enum column — try the first value
                        default_clause = " DEFAULT 'billing'"
                    else:
                        nullable = ""  # fall back to nullable to avoid crash

                stmt = f'ALTER TABLE "{table.name}" ADD COLUMN IF NOT EXISTS "{col.name}" {col_type}{default_clause}{nullable}'
                logger.info("Adding missing column: %s.%s (%s)", table.name, col.name, col_type)
                conn.execute(text(stmt))



def _seed_admin():
    """Create the admin user if it doesn't already exist.
    If the admin already exists, ensure role is admin and
    sync the password if the env var changed.
    """
    from sqlalchemy import select
    from app.db.session import SessionLocal
    from app.models.models import User, UserRole
    from app.core.security import hash_password, verify_password

    db = SessionLocal()
    try:
        existing = db.execute(
            select(User).where(User.email == settings.ADMIN_EMAIL)
        ).scalar_one_or_none()
        if existing:
            changed = False
            # Ensure role is admin
            if existing.role != UserRole.ADMIN:
                existing.role = UserRole.ADMIN
                changed = True
                logger.info("Updated %s role to admin", settings.ADMIN_EMAIL)
            # Sync password if the env var changed
            if not verify_password(settings.ADMIN_PASSWORD, existing.hashed_password):
                existing.hashed_password = hash_password(settings.ADMIN_PASSWORD)
                changed = True
                logger.info("Updated admin password from env")
            if changed:
                db.commit()
            else:
                logger.info("Admin user %s already exists", settings.ADMIN_EMAIL)
            return

        admin = User(
            email=settings.ADMIN_EMAIL,
            hashed_password=hash_password(settings.ADMIN_PASSWORD),
            full_name="Admin",
            role=UserRole.ADMIN,
            is_active=True,
        )
        db.add(admin)
        db.commit()
        logger.info("Created admin user: %s", settings.ADMIN_EMAIL)
    finally:
        db.close()


def _recover_stuck_cases():
    """Reset cases stuck in transient processing states from a prior crash/restart.

    If the server was killed while OCR or analysis was running, those cases
    will be stuck in 'ocr_processing' or 'analyzing' forever.  Move them to
    'needs_review' so the user can re-trigger the pipeline.
    """
    from app.models.models import CaseStatus

    stuck_statuses = [CaseStatus.OCR_PROCESSING, CaseStatus.ANALYZING]

    with engine.begin() as conn:
        result = conn.execute(
            text(
                "UPDATE cases SET status = :target "
                "WHERE status IN :stuck "
                "RETURNING id"
            ),
            {"target": CaseStatus.NEEDS_REVIEW.value, "stuck": tuple(s.value for s in stuck_statuses)},
        )
        rows = result.fetchall()
        if rows:
            logger.info(
                "Recovered %d stuck case(s) (%s) → needs_review",
                len(rows),
                ", ".join(r[0][:8] for r in rows),
            )


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown lifecycle."""
    # ── Startup ──────────────────────────
    logger.info("Creating database tables...")
    Base.metadata.create_all(bind=engine)

    # Ensure PG enum types have all values from Python enums
    _sync_pg_enums()

    # Rename any columns that were renamed in models
    _rename_columns()

    # Add any columns that exist in models but not yet in Postgres
    _sync_missing_columns()

    # Load LCD reference data if not already loaded
    if not is_lcd_data_loaded():
        data_dir = settings.LCD_DATA_DIR
        logger.info(f"Loading LCD reference data from {data_dir}...")
        summary = load_lcd_data(data_dir)
        logger.info(f"LCD ETL summary: {summary}")
    else:
        logger.info("LCD reference data already loaded — skipping ETL")

    # Load billing reference data (PTP, MUE, PFS) if not already loaded
    logger.info("Checking billing reference data...")
    billing_summary = load_all_billing_data(
        ptp_dir=settings.PTP_DATA_DIR,
        mue_dir=settings.MUE_DATA_DIR,
        pfs_dir=settings.PFS_DATA_DIR,
    )
    logger.info(f"Billing ETL summary: {billing_summary}")

    # Seed site_config with default entries (templates, reference data)
    from app.services.config_seed import seed_site_config
    seed_site_config()

    # Seed admin user if it doesn't exist
    _seed_admin()

    # Recover any cases stuck in transient processing states from a prior crash/restart
    _recover_stuck_cases()

    yield
    # ── Shutdown ─────────────────────────
    logger.info("Shutting down...")


app = FastAPI(
    title="MedClaim API",
    version="0.1.0",
    docs_url="/docs" if settings.ENVIRONMENT == "development" else None,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── HIPAA audit logging middleware ──
from starlette.middleware.base import BaseHTTPMiddleware
app.add_middleware(BaseHTTPMiddleware, dispatch=audit_middleware)


# ── Security headers middleware ──
@app.middleware("http")
async def security_headers(request: Request, call_next):
    """Add security headers to every response (HIPAA infrastructure requirement)."""
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    # HSTS — only enable when behind HTTPS (nginx/Cloudflare handles TLS)
    if request.headers.get("x-forwarded-proto") == "https":
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response

app.include_router(auth.router,      prefix="/api/auth",      tags=["auth"])
app.include_router(cases.router,     prefix="/api/cases",     tags=["cases"])
app.include_router(documents.router, prefix="/api/cases",     tags=["documents"])
app.include_router(lcd.router,       prefix="/api/lcd",       tags=["lcd"])
app.include_router(billing.router,   prefix="/api/billing",   tags=["billing"])

from app.api.routes import config
app.include_router(config.router,    prefix="/api/config",    tags=["config"])

from app.api.routes import analytics
app.include_router(analytics.router, prefix="/api/analytics", tags=["analytics"])

from app.api.routes import site_analytics
app.include_router(site_analytics.router, prefix="/api/site-analytics", tags=["site-analytics"])

from app.api.routes import admin
app.include_router(admin.router,     prefix="/api/admin",     tags=["admin"])

from app.api.routes import insurance_plans
app.include_router(insurance_plans.router, prefix="/api/insurance-plans", tags=["insurance-plans"])


@app.get("/health")
def health_check():
    return {"status": "ok"}
