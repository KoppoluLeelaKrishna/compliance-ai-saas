# VigiliCloud — Claude Code Guide

## Project Overview
AWS compliance SaaS — connects AWS accounts, runs posture checks, reviews findings, tracks remediation, and handles billing via Razorpay.

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
RAZORPAY_KEY_ID=rzp_...
RAZORPAY_KEY_SECRET=...
RAZORPAY_WEBHOOK_SECRET=...
RAZORPAY_PLAN_STARTER=plan_...
RAZORPAY_PLAN_PRO=plan_...
RAZORPAY_PLAN_MSP=plan_...
FRONTEND_URL=https://app.vigilicloud.com

GITHUB_CLIENT_ID=Ov23li...         # GitHub OAuth App — sign-in only
GITHUB_CLIENT_SECRET=...
GITHUB_CALLBACK_URL=https://vigilicloud-api.onrender.com/auth/github/callback
```
`GITHUB_CALLBACK_URL` still points at the `onrender.com` hostname, not `api.vigilicloud.com` —
this is deliberate: it must byte-match the callback URL registered in the GitHub OAuth App.
Change both together or sign-in breaks with `redirect_uri_mismatch`.
Without `GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET`, `/auth/github` redirects to
`/signin?error=github_not_configured` — the button stays visible but degrades cleanly.

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

| Piece | Host | Production URL |
|---|---|---|
| UI (Next.js) | **Vercel** | `https://app.vigilicloud.com` |
| Backend (FastAPI) | Render | `https://api.vigilicloud.com` → `vigilicloud-api.onrender.com` |
| Database | Render Postgres | `vigilicloud-db2` (free tier) |

- Auto-deploys from `main` branch on push
- Frontend env var: `NEXT_PUBLIC_API_BASE=https://api.vigilicloud.com`
- DNS is managed at **Namecheap** (`dns1/dns2.registrar-servers.com`). `app` is a CNAME to
  Vercel; `api` is a CNAME to `vigilicloud-api.onrender.com`.

### Known DNS gap
The apex `vigilicloud.com` and `www` still point at the registrar parking IP `192.64.119.204`,
which answers on port 80 but **not 443** — so `https://vigilicloud.com` times out with
`ERR_CONNECTION_TIMED_OUT`. The app is unaffected; only the bare domain is dead. Fix by either
redirecting the apex to `https://app.vigilicloud.com` at Namecheap, or adding the apex as a
Vercel domain. Use `app.vigilicloud.com` in any docs, demos, or decks until this is resolved.

### Legacy frontend
`vigilicloud-ui.onrender.com` is still live and serving an **older build** than Vercel. It
remains in the backend CORS allowlist (`build_cors_origins()` in `backend/app/config.py`).
Retire it once nothing depends on it — two live frontends drift apart silently.
