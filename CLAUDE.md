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
ANTHROPIC_API_KEY=sk-ant-...   # required for AI analysis + the in-app assistant
ASSISTANT_MODEL=claude-opus-5   # optional — assistant model override
ASSISTANT_EFFORT=low           # optional — low | medium | high | xhigh | max
RAZORPAY_KEY_ID=rzp_...
RAZORPAY_KEY_SECRET=...
RAZORPAY_WEBHOOK_SECRET=...
RAZORPAY_PLAN_STARTER=plan_...
RAZORPAY_PLAN_PRO=plan_...
RAZORPAY_PLAN_MSP=plan_...
FRONTEND_URL=https://app.vigilicloud.com
ADMIN_PASSWORD=...             # production: seeds/rotates the default admin (see Auth)

GITHUB_CLIENT_ID=Ov23li...         # GitHub OAuth App — sign-in only
GITHUB_CLIENT_SECRET=...
GITHUB_CALLBACK_URL=https://vigilicloud-api.onrender.com/auth/github/callback
```
`GITHUB_CALLBACK_URL` must byte-match the callback URL registered in the GitHub OAuth App —
change both together or sign-in breaks with `redirect_uri_mismatch`. It currently points at
the `onrender.com` hostname while the UI calls `api.vigilicloud.com`.

Those two names are the same service, but the `gh_oauth_state` cookie is **host-only**: set on
`api.vigilicloud.com`, it is never sent to `vigilicloud-api.onrender.com`, so the callback saw
no cookie and every GitHub sign-in failed with `github_state_mismatch`. `/auth/github` now
redirects to the callback's own host before setting the cookie, so the flow starts and ends on
one origin whatever is registered. If you ever re-register the callback, no code change is
needed — but never assume two hostnames for one service can share a cookie.
Without `GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET`, `/auth/github` redirects to
`/signin?error=github_not_configured` — the button stays visible but degrades cleanly.

## Database
- Local dev: SQLite fallback when `DATABASE_URL` is unset and `APP_ENV != production`
- Production: Postgres (Render `vigilicloud-db2`, expires 2026-06-03 — upgrade before then)
- Schema auto-created on startup via `init_db()` in `main.py`

## Auth
Session-cookie based. `SESSION_COOKIE_NAME`, `SESSION_TTL_HOURS` configured in main.py.
Passwords are salted scrypt (`hash_password()` in `deps.py`). Legacy unsalted SHA-256
hashes still verify and are upgraded on the user's next login. Users change their
password at `POST /auth/change-password` (Settings → Password), which signs out their other sessions.

Default admin: `admin@compliance.local`. Locally it is seeded with `admin123`. In production:
- `admin123` is never seeded and never accepted at login (403), even if it is still stored.
- Set `ADMIN_PASSWORD` to seed the admin, or to rotate an admin still on `admin123`
  on the next restart. Once rotated, the env var can be removed; later changes go
  through Settings.

## API Patterns
- All endpoints in `backend/app/main.py` (monolith — consider splitting into routers when >2000 LOC)
- Rate limiting per IP via `enforce_rate_limit()`
- Sanitize inputs with `sanitize_email()`, `sanitize_password()`, etc. before use

## AI Analysis
`POST /scans/{scan_id}/ai-analysis` — calls Claude Haiku via Anthropic SDK.
Requires `ANTHROPIC_API_KEY` env var. Returns executive summary + prioritized remediation.

## AI Assistant
`POST /assistant/chat` — the in-app chatbot (`backend/app/routers/assistant.py`).
Streams NDJSON frames (`text` / `tool` / `error` / `done`) and answers from the caller's
own data through eight read-only tools: posture overview, accounts, scans, findings
search, finding evidence, fix guidance, framework mappings, plan limits.

Every tool re-derives scope from the session via `require_scan_owner()` /
`validate_account_or_404()` — a scan_id the model invents or is tricked into using
resolves to "scan not found" rather than another tenant's data. Tool failures are
returned as `tool_result` content so the model can recover mid-conversation.

`GET /assistant/config` tells the UI whether to render the widget at all;
`AssistantWidget` (mounted in `LayoutShell`) hides itself when AI is unconfigured.

Model defaults to `claude-opus-5`; override with `ASSISTANT_MODEL` / `ASSISTANT_EFFORT`.

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
### DNS (Namecheap BasicDNS — `dns1/dns2.registrar-servers.com`)

| Type | Host | Value |
|---|---|---|
| A | `@` | `216.198.79.1` (Vercel apex) |
| CNAME | `www` | `4682fb762c9bd9df.vercel-dns-017.com` |
| CNAME | `app` | `4682fb762c9bd9df.vercel-dns-017.com` |
| CNAME | `api` | `vigilicloud-api.onrender.com` |

`vigilicloud.com` and `www` are registered as Vercel domains set to **308 redirect** to
`app.vigilicloud.com`; only `app` is bound to a Production deployment. Verified chain:
`http://vigilicloud.com` → 308 → `https://vigilicloud.com` → 308 → `https://app.vigilicloud.com` (200).
Certs are per-hostname Let's Encrypt, auto-renewed by Vercel.

Do **not** use Namecheap "URL Redirect Record" for the apex. Namecheap implements it by
pointing the host at their parking server (`192.64.119.204`), which listens on port 80 but has
no cert for the domain — `https://vigilicloud.com` then dies with `ERR_CONNECTION_TIMED_OUT`.
This was the original breakage; the redirect has to happen at Vercel's edge, not the registrar.

`www` must stay a redirect, never a Production binding: the backend CORS allowlist
(`build_cors_origins()` in `backend/app/config.py`) has no `www` origin, so an app served there
would load and then fail every API call.

### Legacy frontend (retired)
`vigilicloud-ui.onrender.com` served an older build than Vercel. It is removed from the backend
CORS allowlist (`build_cors_origins()` in `backend/app/config.py`), so it can no longer call the
API; the Render service itself should be suspended or deleted. Do not re-add it.
