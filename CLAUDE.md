# VigiliCloud — Claude Code Guide

## Project Overview
AWS compliance SaaS — connects AWS accounts, runs posture checks, reviews findings, tracks remediation, and handles billing via Stripe.

## Architecture
```
backend/   FastAPI (Python) — REST API + auth + billing + scan orchestration
worker/    Python compliance workers — AWS boto3 checks (S3, IAM, EC2)
ui/        Next.js 16 + Tailwind 4 — dark theme, emerald accents
infra/     CloudFormation templates
```

## Running Locally
```bash
docker compose up --build     # starts db (5432), backend (8000), ui (3000)
```
Or without Docker:
```bash
# Backend
cd backend && pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# UI
cd ui && npm install && npm run dev
```

## Key Environment Variables
```
APP_ENV=production
DATABASE_URL=postgresql://...
ANTHROPIC_API_KEY=sk-ant-...   # required for AI analysis endpoint
STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...
FRONTEND_URL=https://vigilicloud-ui.onrender.com
```

## Database
- Local dev: SQLite fallback when `DATABASE_URL` is unset and `APP_ENV != production`
- Production: Postgres (Render `vigilicloud-db2`, expires 2026-06-03 — upgrade before then)
- Schema auto-created on startup via `init_db()` in `main.py`

## Auth
Session-cookie based. `SESSION_COOKIE_NAME`, `SESSION_TTL_HOURS` configured in main.py.
Default admin: `admin@compliance.local` / `admin123` (seeded on first startup).

## API Patterns
- All endpoints in `backend/app/main.py` (monolith — consider splitting into routers when >2000 LOC)
- Rate limiting per IP via `enforce_rate_limit()`
- Sanitize inputs with `sanitize_email()`, `sanitize_password()`, etc. before use

## AI Analysis
`POST /scans/{scan_id}/ai-analysis` — calls Claude Haiku via Anthropic SDK.
Requires `ANTHROPIC_API_KEY` env var. Returns executive summary + prioritized remediation.

## Compliance Checks (worker/src/)
- `s3_public.py` — S3 public access
- `iam_admin_access.py` — IAM over-permissioned roles
- `ec2_security_groups.py` — open security groups
- `ec2_ebs_encryption.py` — EBS encryption gaps

## UI Routes
`/` home · `/signin` · `/signup` · `/accounts` · `/scans` · `/plans` · `/settings` · `/launch` · `/onboarding`

## Deployment
- Backend + UI + DB on Render (free tier — db expires in 90 days)
- Auto-deploys from `main` branch on push
- Frontend env var: `NEXT_PUBLIC_API_BASE=https://vigilicloud-api.onrender.com`
