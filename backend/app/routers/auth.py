"""
Auth router — /auth/* endpoints.
"""
from __future__ import annotations

import json as _json
import urllib.parse as _urlparse
import urllib.request as _urlrequest
import threading
from typing import Optional

from fastapi import APIRouter, Cookie, Header, HTTPException, Query, Request
from fastapi.responses import JSONResponse, RedirectResponse
from pydantic import BaseModel

from app.config import (
    COOKIE_SAMESITE,
    COOKIE_SECURE,
    FRONTEND_URL,
    GITHUB_CALLBACK_URL,
    GITHUB_CLIENT_ID,
    GITHUB_CLIENT_SECRET,
    SCAN_SCHEDULE_HOURS,
    SESSION_COOKIE_NAME,
    SESSION_TTL_HOURS,
)
from app.deps import (
    LoginIn,
    RegisterIn,
    client_ip,
    create_session,
    delete_session,
    enforce_rate_limit,
    get_bearer_token,
    get_conn,
    get_current_user,
    get_plan_capabilities,
    hash_password,
    list_connected_accounts,
    normalize_account_row,
    now_utc_iso,
    run_account_scan,
    sanitize_email,
    sanitize_password,
    send_slack_alert,
    verify_password,
    LOGIN_RATE_LIMIT,
)

router = APIRouter()


# ---------------------------------------------------------------------------
# GitHub OAuth helpers
# ---------------------------------------------------------------------------

def _gh_post(url: str, payload: dict) -> dict:
    body = _json.dumps(payload).encode()
    req = _urlrequest.Request(
        url, data=body,
        headers={"Accept": "application/json", "Content-Type": "application/json"},
    )
    with _urlrequest.urlopen(req, timeout=10) as resp:
        return _json.loads(resp.read().decode())


def _gh_get(url: str, token: str) -> object:
    req = _urlrequest.Request(
        url,
        headers={"Authorization": f"Bearer {token}", "Accept": "application/json", "User-Agent": "VigiliCloud"},
    )
    with _urlrequest.urlopen(req, timeout=10) as resp:
        return _json.loads(resp.read().decode())


@router.post("/auth/login")
def auth_login(payload: LoginIn, request: Request):
    ip = client_ip(request)
    enforce_rate_limit(f"login:{ip}", LOGIN_RATE_LIMIT[0], LOGIN_RATE_LIMIT[1])

    email = sanitize_email(payload.email)
    password = sanitize_password(payload.password)

    conn = get_conn()
    cur = conn.cursor()
    cur.execute(
        """
        SELECT
            id,
            email,
            password_hash,
            name,
            role,
            subscription_status,
            razorpay_customer_id,
            razorpay_subscription_id
        FROM users
        WHERE lower(email) = ?
        """,
        (email,),
    )
    user = cur.fetchone()
    conn.close()

    if not user or not verify_password(password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    session = create_session(user["id"])

    response = JSONResponse(
        {
            "ok": True,
            "user": {
                "id": user["id"],
                "email": user["email"],
                "name": user["name"],
                "role": user["role"],
                "subscription_status": user["subscription_status"],
            },
            "session": {
                "expires_at": session["expires_at"],
            },
        }
    )
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=session["token"],
        httponly=True,
        samesite=COOKIE_SAMESITE,
        secure=COOKIE_SECURE,
        max_age=SESSION_TTL_HOURS * 60 * 60,
        path="/",
    )
    return response


@router.post("/auth/register")
def auth_register(payload: RegisterIn, request: Request):
    ip = client_ip(request)
    enforce_rate_limit(f"register:{ip}", 5, 300)

    email = sanitize_email(payload.email)
    password = sanitize_password(payload.password)
    name = (payload.name or "").strip()
    if not name or len(name) > 100:
        raise HTTPException(status_code=400, detail="Name is required (max 100 characters)")

    conn = get_conn()
    cur = conn.cursor()
    try:
        cur.execute(
            """
            INSERT INTO users (
                email, password_hash, name, role, created_at,
                subscription_status, razorpay_customer_id, razorpay_subscription_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (email, hash_password(password), name, "user", now_utc_iso(), "free", "", ""),
        )
        conn.commit()
        user_id = cur.lastrowid
    except Exception:
        conn.close()
        raise HTTPException(status_code=409, detail="An account with this email already exists")

    conn.close()

    session = create_session(user_id)
    response = JSONResponse(
        {
            "ok": True,
            "user": {
                "id": user_id,
                "email": email,
                "name": name,
                "role": "user",
                "subscription_status": "free",
            },
            "session": {"expires_at": session["expires_at"]},
        }
    )
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=session["token"],
        httponly=True,
        samesite=COOKIE_SAMESITE,
        secure=COOKIE_SECURE,
        max_age=SESSION_TTL_HOURS * 60 * 60,
        path="/",
    )
    return response


@router.post("/auth/logout")
def auth_logout(
    session_cookie: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
    authorization: Optional[str] = Header(default=None),
):
    token = session_cookie or get_bearer_token(authorization)
    delete_session(token)

    response = JSONResponse({"ok": True})
    response.delete_cookie(
        key=SESSION_COOKIE_NAME,
        path="/",
        samesite=COOKIE_SAMESITE,
        secure=COOKIE_SECURE,
        httponly=True,
    )
    return response


@router.post("/auth/exchange")
def auth_exchange(token: str = Query(...)):
    """Exchange a raw session token (from OAuth redirect URL) for a session cookie."""
    conn = get_conn()
    row = conn.execute(
        "SELECT user_id FROM auth_sessions WHERE session_token = ?", (token,)
    ).fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    response = JSONResponse({"ok": True})
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=token,
        httponly=True,
        samesite=COOKIE_SAMESITE,
        secure=COOKIE_SECURE,
        max_age=SESSION_TTL_HOURS * 60 * 60,
        path="/",
    )
    return response


@router.get("/auth/github")
def github_oauth_start():
    if not GITHUB_CLIENT_ID:
        raise HTTPException(status_code=503, detail="GitHub OAuth is not configured.")
    params = _urlparse.urlencode({
        "client_id": GITHUB_CLIENT_ID,
        "redirect_uri": GITHUB_CALLBACK_URL,
        "scope": "user:email",
    })
    return RedirectResponse(f"https://github.com/login/oauth/authorize?{params}")


@router.get("/auth/github/callback")
def github_oauth_callback(code: str = Query(...)):
    if not GITHUB_CLIENT_ID or not GITHUB_CLIENT_SECRET:
        return RedirectResponse(f"{FRONTEND_URL}/signin?error=github_not_configured")

    # Exchange code → access token
    try:
        token_data = _gh_post(
            "https://github.com/login/oauth/access_token",
            {"client_id": GITHUB_CLIENT_ID, "client_secret": GITHUB_CLIENT_SECRET, "code": code},
        )
    except Exception:
        return RedirectResponse(f"{FRONTEND_URL}/signin?error=github_failed")

    access_token = token_data.get("access_token") if isinstance(token_data, dict) else None
    if not access_token:
        return RedirectResponse(f"{FRONTEND_URL}/signin?error=github_failed")

    # Get GitHub user profile
    try:
        user_data = _gh_get("https://api.github.com/user", access_token)
    except Exception:
        return RedirectResponse(f"{FRONTEND_URL}/signin?error=github_failed")

    if not isinstance(user_data, dict):
        return RedirectResponse(f"{FRONTEND_URL}/signin?error=github_failed")

    # Resolve primary verified email
    email = user_data.get("email")
    if not email:
        try:
            emails = _gh_get("https://api.github.com/user/emails", access_token)
            if isinstance(emails, list):
                email = next(
                    (e["email"] for e in emails if e.get("primary") and e.get("verified")),
                    next((e["email"] for e in emails if e.get("verified")), None),
                )
        except Exception:
            pass
    if not email:
        email = f"github_{user_data.get('id', 'unknown')}@users.noreply.github.com"

    email = email.lower().strip()
    name = (user_data.get("name") or user_data.get("login") or "GitHub User").strip()[:100]

    # Find or create user
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("SELECT id FROM users WHERE lower(email) = ?", (email,))
    row = cur.fetchone()

    if row:
        user_id = row["id"]
    else:
        cur.execute(
            """
            INSERT INTO users (
                email, password_hash, name, role, created_at,
                subscription_status, razorpay_customer_id, razorpay_subscription_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (email, "", name, "user", now_utc_iso(), "free", "", ""),
        )
        conn.commit()
        user_id = cur.lastrowid
    conn.close()

    session = create_session(user_id)
    # Redirect to frontend exchange page — cookie is set via credentialed XHR
    # from there, which works reliably cross-origin unlike redirect+Set-Cookie.
    return RedirectResponse(
        f"{FRONTEND_URL}/auth/callback?token={session['token']}",
        status_code=302,
    )


@router.get("/auth/me")
def auth_me(
    session_cookie: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
    authorization: Optional[str] = Header(default=None),
):
    user = get_current_user(session_cookie, authorization)
    return {
        "authenticated": True,
        "user": {
            "id": user["id"],
            "email": user["email"],
            "name": user["name"],
            "role": user["role"],
            "subscription_status": user.get("subscription_status", "free"),
        },
    }


# ---------------------------------------------------------------------------
# Scheduled scans settings
# ---------------------------------------------------------------------------

class ScanScheduleIn(BaseModel):
    enabled: bool


@router.get("/settings/scan-schedule")
def get_scan_schedule(
    session_cookie: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
    authorization: Optional[str] = Header(default=None),
):
    user = get_current_user(session_cookie, authorization)
    conn = get_conn()
    try:
        row = conn.execute(
            "SELECT scheduled_scans_enabled FROM users WHERE id = ?", (user["id"],)
        ).fetchone()
        enabled = bool(row["scheduled_scans_enabled"]) if row else False
    except Exception:
        enabled = False
    finally:
        conn.close()
    caps = get_plan_capabilities(user.get("subscription_status", "free"))
    return {
        "enabled": enabled,
        "interval_hours": SCAN_SCHEDULE_HOURS,
        "plan_supports": caps.get("account_linked_scans", False),
    }


@router.put("/settings/scan-schedule")
def update_scan_schedule(
    payload: ScanScheduleIn,
    session_cookie: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
    authorization: Optional[str] = Header(default=None),
):
    user = get_current_user(session_cookie, authorization)
    conn = get_conn()
    conn.execute(
        "UPDATE users SET scheduled_scans_enabled = ? WHERE id = ?",
        (1 if payload.enabled else 0, user["id"]),
    )
    conn.commit()
    conn.close()
    return {"ok": True, "enabled": payload.enabled}


@router.post("/settings/run-now")
def run_scans_now(
    session_cookie: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
    authorization: Optional[str] = Header(default=None),
):
    user = get_current_user(session_cookie, authorization)
    caps = get_plan_capabilities(user.get("subscription_status", "free"))
    if not caps.get("account_linked_scans"):
        raise HTTPException(status_code=403, detail="Account-linked scans require a paid plan")

    def _run():
        try:
            accounts = list_connected_accounts(user_id=user["id"])
            for account_row in accounts:
                account = normalize_account_row(dict(account_row))
                if account and account.get("is_active") and account.get("role_arn"):
                    run_account_scan(account, dict(user))
        except Exception:
            pass

    threading.Thread(target=_run, daemon=True).start()
    return {"ok": True, "message": "Scans started in background"}


# ---------------------------------------------------------------------------
# Slack webhook settings
# ---------------------------------------------------------------------------

class SlackWebhookIn(BaseModel):
    webhook_url: str


def _mask_url(url: str) -> str:
    if not url:
        return ""
    if len(url) <= 44:
        return url[:10] + "***"
    return url[:40] + "…***"


@router.get("/settings/slack-webhook")
def get_slack_webhook(
    session_cookie: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
    authorization: Optional[str] = Header(default=None),
):
    user = get_current_user(session_cookie, authorization)
    conn = get_conn()
    try:
        row = conn.execute(
            "SELECT slack_webhook_url FROM users WHERE id = ?", (user["id"],)
        ).fetchone()
        url = (row["slack_webhook_url"] or "") if row else ""
    except Exception:
        url = ""
    finally:
        conn.close()
    return {"configured": bool(url), "webhook_url_masked": _mask_url(url)}


@router.put("/settings/slack-webhook")
def update_slack_webhook(
    payload: SlackWebhookIn,
    session_cookie: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
    authorization: Optional[str] = Header(default=None),
):
    user = get_current_user(session_cookie, authorization)
    url = payload.webhook_url.strip()
    if url and not url.startswith("https://"):
        raise HTTPException(status_code=400, detail="Webhook URL must start with https://")
    conn = get_conn()
    conn.execute("UPDATE users SET slack_webhook_url = ? WHERE id = ?", (url, user["id"]))
    conn.commit()
    conn.close()
    return {"ok": True, "configured": bool(url)}


@router.delete("/settings/slack-webhook")
def delete_slack_webhook(
    session_cookie: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
    authorization: Optional[str] = Header(default=None),
):
    user = get_current_user(session_cookie, authorization)
    conn = get_conn()
    conn.execute("UPDATE users SET slack_webhook_url = '' WHERE id = ?", (user["id"],))
    conn.commit()
    conn.close()
    return {"ok": True, "configured": False}


@router.post("/settings/test-slack")
def test_slack_webhook(
    session_cookie: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
    authorization: Optional[str] = Header(default=None),
):
    user = get_current_user(session_cookie, authorization)
    conn = get_conn()
    try:
        row = conn.execute(
            "SELECT slack_webhook_url FROM users WHERE id = ?", (user["id"],)
        ).fetchone()
        url = (row["slack_webhook_url"] or "") if row else ""
    except Exception:
        url = ""
    finally:
        conn.close()
    if not url:
        raise HTTPException(status_code=400, detail="No Slack webhook configured")
    send_slack_alert(
        webhook_url=url,
        critical_count=1,
        account_name="test-account",
        scan_id="test-0000-0000",
    )
    return {"ok": True, "message": "Test alert sent to Slack"}
