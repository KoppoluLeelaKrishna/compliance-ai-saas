"""
Auth router — /auth/* endpoints.
"""
from __future__ import annotations

import json as _json
import secrets as _secrets
import urllib.parse as _urlparse
import urllib.request as _urlrequest
import threading
from base64 import b64encode as _b64encode
from datetime import datetime as _datetime, timedelta as _timedelta, timezone as _timezone
from typing import Optional

from fastapi import APIRouter, Cookie, Header, HTTPException, Query, Request
from fastapi.responses import JSONResponse, RedirectResponse
from pydantic import BaseModel

from app.config import (
    COOKIE_SAMESITE,
    COOKIE_SECURE,
    DEFAULT_ADMIN_EMAIL,
    DEV_ADMIN_PASSWORD,
    FRONTEND_URL,
    GITHUB_CALLBACK_URL,
    GITHUB_CLIENT_ID,
    GITHUB_CLIENT_SECRET,
    IS_PRODUCTION,
    SCAN_SCHEDULE_HOURS,
    SESSION_COOKIE_NAME,
    SESSION_TTL_HOURS,
)
from app.deps import (
    LoginIn,
    RegisterIn,
    client_ip,
    create_session,
    decrypt_secret,
    delete_session,
    encrypt_secret,
    enforce_rate_limit,
    get_bearer_token,
    get_conn,
    get_current_user,
    get_plan_capabilities,
    hash_password,
    list_connected_accounts,
    normalize_account_row,
    now_utc_iso,
    password_needs_rehash,
    run_account_scan,
    sanitize_email,
    sanitize_password,
    send_slack_alert,
    verify_password,
    LOGIN_RATE_LIMIT,
)

router = APIRouter()

# Sign-in reads the user's verified email address and nothing else. Keep this in
# lockstep with the disclosure shown on the sign-in and sign-up pages.
GITHUB_OAUTH_SCOPE = "user:email"

# CSRF nonce binding the authorize redirect to the callback that follows it.
GITHUB_STATE_COOKIE = "gh_oauth_state"
GITHUB_STATE_TTL_SECONDS = 600

# One-time code swapped for the session cookie by the frontend callback page.
EXCHANGE_CODE_TTL_SECONDS = 120


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


def _gh_revoke_token(access_token: str) -> None:
    """
    Hand the OAuth token straight back to GitHub once we are done with it.

    Sign-in only ever needs the user's verified email, so there is no reason for
    VigiliCloud to keep a usable GitHub credential afterwards. Revoking makes
    that guarantee verifiable rather than a promise — the grant disappears from
    the user's GitHub authorizations immediately. Best-effort: a failure here
    must never block a successful sign-in.
    """
    if not (GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET and access_token):
        return
    try:
        basic = _b64encode(f"{GITHUB_CLIENT_ID}:{GITHUB_CLIENT_SECRET}".encode()).decode()
        req = _urlrequest.Request(
            f"https://api.github.com/applications/{GITHUB_CLIENT_ID}/token",
            data=_json.dumps({"access_token": access_token}).encode(),
            method="DELETE",
            headers={
                "Authorization": f"Basic {basic}",
                "Accept": "application/vnd.github+json",
                "Content-Type": "application/json",
                "User-Agent": "VigiliCloud",
                "X-GitHub-Api-Version": "2022-11-28",
            },
        )
        with _urlrequest.urlopen(req, timeout=10):
            pass
    except Exception:
        pass


def _create_exchange_code(session_token: str) -> str:
    """
    Mint a single-use, short-lived code standing in for the session token.

    The session token itself must never travel in a redirect URL: it would be
    captured by backend access logs, proxies, and the browser address bar while
    still being valid for the session's full lifetime. This code is good for one
    POST within EXCHANGE_CODE_TTL_SECONDS.
    """
    code = _secrets.token_urlsafe(32)
    expires_at = (
        _datetime.now(_timezone.utc) + _timedelta(seconds=EXCHANGE_CODE_TTL_SECONDS)
    ).isoformat()

    conn = get_conn()
    conn.execute(
        "INSERT INTO oauth_exchange_codes (code, session_token, expires_at) VALUES (?, ?, ?)",
        (code, session_token, expires_at),
    )
    # Opportunistic cleanup so expired rows do not accumulate.
    conn.execute(
        "DELETE FROM oauth_exchange_codes WHERE expires_at < ?",
        (_datetime.now(_timezone.utc).isoformat(),),
    )
    conn.commit()
    conn.close()
    return code


def _consume_exchange_code(code: str) -> Optional[str]:
    """Redeem an exchange code, returning its session token. Single use."""
    conn = get_conn()
    row = conn.execute(
        "SELECT session_token, expires_at FROM oauth_exchange_codes WHERE code = ?",
        (code,),
    ).fetchone()
    if not row:
        conn.close()
        return None

    # Delete first: even an expired or racing redemption burns the code.
    conn.execute("DELETE FROM oauth_exchange_codes WHERE code = ?", (code,))
    conn.commit()
    conn.close()

    if row["expires_at"] < _datetime.now(_timezone.utc).isoformat():
        return None
    return row["session_token"]


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

    if not user or not verify_password(password, user["password_hash"]):
        conn.close()
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if (
        IS_PRODUCTION
        and user["email"].lower() == DEFAULT_ADMIN_EMAIL.lower()
        and password == DEV_ADMIN_PASSWORD
    ):
        # The dev password is published in the repo; never let it open production.
        conn.close()
        raise HTTPException(
            status_code=403,
            detail="This account still uses the default password. Set ADMIN_PASSWORD on the server to reset it.",
        )

    if password_needs_rehash(user["password_hash"]):
        cur.execute("UPDATE users SET password_hash = ? WHERE id = ?", (hash_password(password), user["id"]))
        conn.commit()
    conn.close()

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


class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str


@router.post("/auth/change-password")
def auth_change_password(
    payload: ChangePasswordIn,
    request: Request,
    session_cookie: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
    authorization: Optional[str] = Header(default=None),
):
    user = get_current_user(session_cookie, authorization)
    # Shares the login bucket: this endpoint also verifies a password guess.
    enforce_rate_limit(f"login:{client_ip(request)}", LOGIN_RATE_LIMIT[0], LOGIN_RATE_LIMIT[1])

    new_password = sanitize_password(payload.new_password)
    if len(new_password) < 8:
        raise HTTPException(status_code=400, detail="New password must be at least 8 characters")
    if new_password == DEV_ADMIN_PASSWORD:
        raise HTTPException(status_code=400, detail="Choose a different password")

    conn = get_conn()
    cur = conn.cursor()
    cur.execute("SELECT password_hash FROM users WHERE id = ?", (user["id"],))
    row = cur.fetchone()
    if not row or not verify_password(payload.current_password or "", row["password_hash"]):
        conn.close()
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    if payload.current_password == new_password:
        conn.close()
        raise HTTPException(status_code=400, detail="New password must differ from the current one")

    cur.execute("UPDATE users SET password_hash = ? WHERE id = ?", (hash_password(new_password), user["id"]))
    # Sign out every other session; keep the one making this request.
    cur.execute(
        "DELETE FROM auth_sessions WHERE user_id = ? AND session_token <> ?",
        (user["id"], user.get("session_token") or ""),
    )
    conn.commit()
    conn.close()
    return {"ok": True}


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
def auth_exchange(request: Request, code: str = Query(...)):
    """Redeem a single-use OAuth exchange code for a session cookie."""
    enforce_rate_limit(f"oauth_exchange:{client_ip(request)}", LOGIN_RATE_LIMIT[0], LOGIN_RATE_LIMIT[1])

    token = _consume_exchange_code(code)
    if not token:
        raise HTTPException(status_code=401, detail="Invalid or expired code")

    conn = get_conn()
    row = conn.execute(
        "SELECT user_id FROM auth_sessions WHERE session_token = ?", (token,)
    ).fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=401, detail="Invalid or expired code")

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
def github_oauth_start(request: Request):
    if not GITHUB_CLIENT_ID or not GITHUB_CLIENT_SECRET:
        # This is reached by a browser navigation, so send the user back to a
        # page that can explain itself rather than a raw JSON error body.
        return RedirectResponse(f"{FRONTEND_URL}/signin?error=github_not_configured")

    # The state cookie is host-only, so only the exact host that set it can read
    # it back. GITHUB_CALLBACK_URL has to byte-match what is registered in the
    # GitHub OAuth App, and that host is not necessarily the one this request
    # arrived on: api.vigilicloud.com and vigilicloud-api.onrender.com are the
    # same service behind two names. Starting the flow on one and returning to
    # the other means the callback never sees the cookie, so every sign-in dies
    # as a state mismatch.
    #
    # Hand the flow to the callback's own host first. After that bounce the
    # hosts match, this branch is false, and no loop is possible.
    callback = _urlparse.urlparse(GITHUB_CALLBACK_URL)
    if callback.netloc and request.url.netloc != callback.netloc:
        return RedirectResponse(
            str(request.url.replace(netloc=callback.netloc, scheme=callback.scheme or "https"))
        )

    # Bind this authorize request to the callback that comes back, so a callback
    # forged by an attacker (which would otherwise log the victim into the
    # attacker's account) cannot be accepted.
    state = _secrets.token_urlsafe(32)

    params = _urlparse.urlencode({
        "client_id": GITHUB_CLIENT_ID,
        "redirect_uri": GITHUB_CALLBACK_URL,
        "scope": GITHUB_OAUTH_SCOPE,
        "state": state,
    })
    response = RedirectResponse(f"https://github.com/login/oauth/authorize?{params}")
    response.set_cookie(
        key=GITHUB_STATE_COOKIE,
        value=state,
        httponly=True,
        # Must be 'lax', not 'strict': the callback arrives as a top-level
        # navigation from github.com and 'strict' would withhold the cookie.
        samesite="lax",
        secure=COOKIE_SECURE,
        max_age=GITHUB_STATE_TTL_SECONDS,
        path="/",
    )
    return response


@router.get("/auth/github/callback")
def github_oauth_callback(
    code: str = Query(...),
    state: str = Query(default=""),
    state_cookie: Optional[str] = Cookie(default=None, alias=GITHUB_STATE_COOKIE),
):
    def _fail(reason: str) -> RedirectResponse:
        resp = RedirectResponse(f"{FRONTEND_URL}/signin?error={reason}")
        resp.delete_cookie(GITHUB_STATE_COOKIE, path="/")
        return resp

    if not GITHUB_CLIENT_ID or not GITHUB_CLIENT_SECRET:
        return _fail("github_not_configured")

    # CSRF check — constant-time, and both halves must actually be present.
    # A missing cookie and a wrong cookie look identical to the user but mean
    # very different things to an operator: missing points at host or SameSite
    # configuration, wrong points at a forged or stale callback.
    if not state_cookie:
        return _fail("github_state_missing")
    if not state or not _secrets.compare_digest(state, state_cookie):
        return _fail("github_state_mismatch")

    # Exchange code → access token
    try:
        token_data = _gh_post(
            "https://github.com/login/oauth/access_token",
            {
                "client_id": GITHUB_CLIENT_ID,
                "client_secret": GITHUB_CLIENT_SECRET,
                "code": code,
                "redirect_uri": GITHUB_CALLBACK_URL,
            },
        )
    except Exception:
        return _fail("github_failed")

    access_token = token_data.get("access_token") if isinstance(token_data, dict) else None
    if not access_token:
        return _fail("github_failed")

    try:
        user_data = _gh_get("https://api.github.com/user", access_token)
        if not isinstance(user_data, dict) or not user_data.get("id"):
            return _fail("github_failed")

        # Only ever trust /user/emails, and only entries GitHub reports as both
        # primary and verified. The profile email on /user is not a safe basis
        # for matching an existing account.
        email = None
        try:
            emails = _gh_get("https://api.github.com/user/emails", access_token)
            if isinstance(emails, list):
                email = next(
                    (
                        e["email"] for e in emails
                        if isinstance(e, dict)
                        and e.get("primary") and e.get("verified") and e.get("email")
                    ),
                    None,
                )
        except Exception:
            email = None
    finally:
        # We have everything sign-in needs; give the credential back.
        _gh_revoke_token(access_token)

    if not email:
        # No verified primary email means we cannot safely identify this person.
        return _fail("github_email_unverified")

    github_id = str(user_data["id"])
    email = email.lower().strip()
    name = (user_data.get("name") or user_data.get("login") or "GitHub User").strip()[:100]

    conn = get_conn()
    cur = conn.cursor()

    # Match on the immutable GitHub account id first; fall back to the verified
    # email only for users who predate github_id or signed up with a password.
    cur.execute("SELECT id FROM users WHERE github_id = ?", (github_id,))
    row = cur.fetchone()
    if row:
        user_id = row["id"]
    else:
        cur.execute("SELECT id, github_id FROM users WHERE lower(email) = ?", (email,))
        row = cur.fetchone()
        if row and not row["github_id"]:
            # Link this GitHub identity to the existing account, permanently.
            user_id = row["id"]
            cur.execute("UPDATE users SET github_id = ? WHERE id = ?", (github_id, user_id))
            conn.commit()
        elif row:
            # Email already claimed by a different GitHub identity — refuse
            # rather than hand over someone else's account.
            conn.close()
            return _fail("github_account_conflict")
        else:
            cur.execute(
                """
                INSERT INTO users (
                    email, password_hash, name, role, created_at,
                    subscription_status, razorpay_customer_id, razorpay_subscription_id,
                    github_id
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (email, "", name, "user", now_utc_iso(), "free", "", "", github_id),
            )
            conn.commit()
            user_id = cur.lastrowid
    conn.close()

    session = create_session(user_id)
    # Redirect carries a single-use code, never the session token itself. The
    # frontend swaps it for the cookie via credentialed XHR, which works
    # reliably cross-origin unlike redirect+Set-Cookie.
    exchange_code = _create_exchange_code(session["token"])
    response = RedirectResponse(
        f"{FRONTEND_URL}/auth/callback?code={_urlparse.quote(exchange_code)}",
        status_code=302,
    )
    response.delete_cookie(GITHUB_STATE_COOKIE, path="/")
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
    conn.execute("UPDATE users SET slack_webhook_url = ? WHERE id = ?", (encrypt_secret(url), user["id"]))
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
    url = decrypt_secret(url)
    if not url:
        raise HTTPException(status_code=400, detail="No Slack webhook configured")
    send_slack_alert(
        webhook_url=url,
        critical_count=1,
        account_name="test-account",
        scan_id="test-0000-0000",
    )
    return {"ok": True, "message": "Test alert sent to Slack"}
