"""
Auth router — /auth/* endpoints.
"""
from __future__ import annotations

import json as _json
import urllib.parse as _urlparse
import urllib.request as _urlrequest
from typing import Optional

from fastapi import APIRouter, Cookie, Header, HTTPException, Query, Request
from fastapi.responses import JSONResponse, RedirectResponse

from app.config import (
    COOKIE_SAMESITE,
    COOKIE_SECURE,
    FRONTEND_URL,
    GITHUB_CALLBACK_URL,
    GITHUB_CLIENT_ID,
    GITHUB_CLIENT_SECRET,
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
    hash_password,
    now_utc_iso,
    sanitize_email,
    sanitize_password,
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
            stripe_customer_id,
            stripe_subscription_id
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
                subscription_status, stripe_customer_id, stripe_subscription_id
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
                subscription_status, stripe_customer_id, stripe_subscription_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (email, "", name, "user", now_utc_iso(), "free", "", ""),
        )
        conn.commit()
        user_id = cur.lastrowid
    conn.close()

    session = create_session(user_id)
    response = RedirectResponse(f"{FRONTEND_URL}/scans")
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
