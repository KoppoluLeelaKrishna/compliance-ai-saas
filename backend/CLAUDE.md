# Backend — Claude Code Guide

## Stack
FastAPI + Python 3.12 · SQLite (local) · Postgres (production) · boto3 · Stripe · Anthropic SDK

## Entry Point
`app/main.py` — single-file monolith with all routes, models, and business logic.

## Running
```bash
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

## Key Patterns

### Adding a new endpoint
```python
@app.post("/resource/action")
def my_endpoint(
    payload: MyInputModel,
    session_cookie: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
    authorization: Optional[str] = Header(default=None),
):
    user = get_current_user(session_cookie, authorization)  # raises 401 if not authed
    # ... business logic
    return {"ok": True}
```

### Adding a new Pydantic input model
```python
class MyInputModel(BaseModel):
    field: str
    optional_field: Optional[str] = None
```

### Database queries
```python
conn = get_conn()
cur = conn.cursor()
cur.execute("SELECT * FROM users WHERE id = ?", (user_id,))
row = cur.fetchone()
conn.close()
```
Use `?` for SQLite, `%s` for Postgres — `_normalize_sql()` handles the swap automatically.

### Rate limiting
```python
enforce_rate_limit(f"action:{ip}", limit=10, window_seconds=300)
```

### Input sanitization — always sanitize before use
```python
email = sanitize_email(payload.email)      # validates format, strips, lowercases
password = sanitize_password(payload.password)  # validates length 6-200
region = sanitize_region(payload.region)
```

## Auth Flow
1. `POST /auth/login` or `POST /auth/register` → sets session cookie
2. `get_current_user(session_cookie, authorization)` validates on every protected endpoint
3. `POST /auth/logout` → deletes session

## AI Analysis Endpoint
`POST /scans/{scan_id}/ai-analysis` — uses `anthropic` SDK with Claude Haiku.
Requires `ANTHROPIC_API_KEY` env var. Returns JSON `{scan_id, analysis, findings_count}`.

## Adding More Compliance Checks
Workers live in `../worker/src/`. Each check:
1. Takes boto3 session + account config
2. Returns list of finding dicts
3. Gets registered in worker's scan runner

## Common Gotchas
- Switch between SQLite/Postgres via `USE_POSTGRES` flag (set by `APP_ENV=production` + `DATABASE_URL`)
- `add_user_column_if_missing()` handles schema migrations safely
- Never commit `.env` or `compliance.db`
