from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    # App
    ENVIRONMENT: str = "development"
    SECRET_KEY: str = "dev-secret-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24 hours

    # Database
    DATABASE_URL: str = "postgresql://medclaim:medclaim@postgres:5432/medclaim"

    # AWS (Textract fallback for scanned docs, LocalStack in dev)
    AWS_ACCESS_KEY_ID: str = ""
    AWS_SECRET_ACCESS_KEY: str = ""
    AWS_REGION: str = "us-east-1"
    AWS_S3_BUCKET: str = "medclaim-documents"
    S3_ENDPOINT_URL: str = ""  # e.g. http://localstack:4566 for dev

    # LCD reference data (CMS bulk CSVs)
    LCD_DATA_DIR: str = "/data/lcd_analysis/all_data"

    # NCCI PTP edits (unbundling)
    PTP_DATA_DIR: str = "/data/ptp_analysis/extracted"

    # NCCI MUE (quantity limits) — add later
    MUE_DATA_DIR: str = "/data/mue_analysis/extracted"

    # Physician Fee Schedule (price check)
    PFS_DATA_DIR: str = "/data/pfs_analysis"

    # Admin seed account (created on first startup)
    ADMIN_EMAIL: str = "admin@medclaim.app"
    ADMIN_PASSWORD: str = "admin"   # override in .env for production

    # CORS
    ALLOWED_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://localhost:5173",
    ]

    class Config:
        env_file = ".env"


settings = Settings()
