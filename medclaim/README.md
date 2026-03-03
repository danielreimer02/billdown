# MedClaim

Medical billing dispute automation.

## Stack

- **Frontend**: React + TypeScript + Vite + Tailwind
- **Backend**: Python + FastAPI
- **Database**: PostgreSQL + SQLAlchemy + Alembic
- **Queue**: Redis + Celery
- **Storage**: Digital Ocean Spaces (S3-compatible)
- **OCR**: pdfplumber (native PDFs) + AWS Textract (scanned)
- **Infrastructure**: Docker + docker-compose

## Setup

```bash
# 1. Clone and enter project
git clone <repo>
cd medclaim

# 2. Copy env file
cp backend/.env.example backend/.env
# Edit backend/.env with your keys

# 3. Start everything
docker-compose up --build

# 4. Run database migrations (first time only)
docker-compose exec backend alembic upgrade head

# 5. Frontend (separate terminal)
cd frontend
npm install
npm run dev
```

## Development URLs

- Frontend: http://localhost:5173
- Backend API: http://localhost:8000
- API Docs: http://localhost:8000/docs
- Database: localhost:5432

## Project Structure

```
medclaim/
├── backend/
│   ├── app/
│   │   ├── api/routes/     # FastAPI route handlers
│   │   ├── core/           # Config, settings
│   │   ├── db/             # Database session
│   │   ├── models/         # SQLAlchemy models
│   │   ├── schemas/        # Pydantic request/response schemas
│   │   ├── services/       # Business logic
│   │   │   ├── document_processor.py  # OCR routing
│   │   │   ├── lcd_service.py         # CMS LCD lookups
│   │   │   └── ncci_service.py        # NCCI/MUE validation
│   │   └── workers/        # Celery async tasks
│   └── tests/
├── frontend/
│   └── src/
│       ├── components/     # Reusable UI components
│       ├── pages/          # Route-level page components
│       ├── hooks/          # Custom React hooks
│       ├── lib/            # API client, utilities
│       ├── types/          # TypeScript types (mirrors backend models)
│       └── store/          # Zustand state management
└── infra/                  # Digital Ocean / deployment config
```

## Build Order

1. **LCD lookup** — `GET /api/lcd/lookup` — validate CMS API works
2. **Case creation** — `POST /api/cases/` — basic CRUD
3. **Document upload** — `POST /api/documents/{case_id}/upload`
4. **OCR pipeline** — pdfplumber → Celery → Postgres
5. **NCCI/MUE analysis** — load CMS CSVs, validate against extracted codes
6. **Letter generation** — template + findings → dispute letter
7. **Auth** — JWT login/signup
8. **Frontend UI** — wire pages to API
```
