import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.api.routes import cases, documents, lcd, auth
from app.db.session import engine, Base
from app.services.ncci_service import load_sample_data
from app.services.lcd_etl import load_lcd_data, is_lcd_data_loaded

# Import models so Base.metadata knows about all tables
import app.models.models  # noqa: F401
import app.models.lcd_models  # noqa: F401

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown lifecycle."""
    # ── Startup ──────────────────────────
    logger.info("Creating database tables...")
    Base.metadata.create_all(bind=engine)

    logger.info("Loading sample NCCI/MUE data...")
    load_sample_data()

    # Load LCD reference data if not already loaded
    if not is_lcd_data_loaded():
        data_dir = settings.LCD_DATA_DIR
        logger.info(f"Loading LCD reference data from {data_dir}...")
        summary = load_lcd_data(data_dir)
        logger.info(f"LCD ETL summary: {summary}")
    else:
        logger.info("LCD reference data already loaded — skipping ETL")

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

app.include_router(auth.router,      prefix="/api/auth",      tags=["auth"])
app.include_router(cases.router,     prefix="/api/cases",     tags=["cases"])
app.include_router(documents.router, prefix="/api/documents", tags=["documents"])
app.include_router(lcd.router,       prefix="/api/lcd",       tags=["lcd"])


@app.get("/health")
def health_check():
    return {"status": "ok"}
