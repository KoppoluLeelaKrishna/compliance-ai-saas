"""
Shared helpers, Pydantic models, DB wrappers, and rate-limiting
used across all VigiliCloud routers.

Routers import from here:
    from app.deps import get_current_user, enforce_rate_limit, ...
"""
from __future__ import annotations

import csv
import hashlib
import hmac
import io
import json
import os
import secrets
import sqlite3
import subprocess
import threading
import time
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone
from typing import Any, Deque, Dict, List, Optional
from urllib.parse import urlparse

import boto3
import razorpay
from fastapi import HTTPException, Request
from pydantic import BaseModel

from app.config import (
    APP_ENV,
    AWS_ACCOUNT_ID_RE,
    AWS_REGION_RE,
    BILLING_RATE_LIMIT,
    BUCKET_NAME_RE,
    COOKIE_SAMESITE,
    COOKIE_SECURE,
    FRONTEND_URL,
    LOGIN_RATE_LIMIT,
    PLAN_ACCOUNT_LIMITS,
    PROJECT_ROOT,
    PYTHON_EXE,
    RAZORPAY_KEY_ID,
    RAZORPAY_KEY_SECRET,
    RAZORPAY_PLAN_IDS,
    RAZORPAY_PLAN_MSP,
    RAZORPAY_PLAN_PRO,
    RAZORPAY_PLAN_STARTER,
    RAZORPAY_WEBHOOK_SECRET,
    RESEND_API_KEY,
    FROM_EMAIL,
    ROLE_ARN_RE,
    SCAN_RATE_LIMIT,
    SCANNER_PATH,
    SESSION_COOKIE_NAME,
    SESSION_TTL_HOURS,
    USE_POSTGRES,
    WEBHOOK_RATE_LIMIT,
)

# ---------------------------------------------------------------------------
# DB layer — conditional import mirrors original main.py
# ---------------------------------------------------------------------------
if USE_POSTGRES:
    from worker.src.utils.db_postgres import (  # noqa: E402
        create_approval_event,
        create_connected_account,
        delete_connected_account,
        get_actions,
        get_approval_events,
        get_connected_account,
        get_conn as db_get_conn,
        get_findings,
        get_finding_approval_status,
        get_fix_guidance,
        get_previous_scan_id,
        get_scan,
        get_scan_account_link,
        init_db,
        list_connected_accounts,
        list_scans,
        save_scan_account_link,
        update_connected_account,
        update_connected_account_status,
        update_scan_user_id,
        upsert_action,
        upsert_fix_guidance,
    )
else:
    from worker.src.utils.db_sqlite import (  # noqa: E402
        create_approval_event,
        create_connected_account,
        delete_connected_account,
        get_actions,
        get_approval_events,
        get_connected_account,
        get_conn as db_get_conn,
        get_findings,
        get_finding_approval_status,
        get_fix_guidance,
        get_previous_scan_id,
        get_scan,
        get_scan_account_link,
        init_db,
        list_connected_accounts,
        list_scans,
        save_scan_account_link,
        update_connected_account,
        update_connected_account_status,
        update_scan_user_id,
        upsert_action,
        upsert_fix_guidance,
    )

# re-export so routers can do: from app.deps import init_db, ...
__all__ = [
    "init_db",
    "create_approval_event",
    "create_connected_account",
    "delete_connected_account",
    "get_actions",
    "get_approval_events",
    "get_connected_account",
    "get_findings",
    "get_finding_approval_status",
    "get_fix_guidance",
    "get_previous_scan_id",
    "get_scan",
    "get_scan_account_link",
    "list_connected_accounts",
    "list_scans",
    "save_scan_account_link",
    "update_connected_account",
    "update_connected_account_status",
    "update_scan_user_id",
    "upsert_action",
    "upsert_fix_guidance",
]

# ---------------------------------------------------------------------------
# Rate-limit state
# ---------------------------------------------------------------------------
RATE_LIMIT_BUCKETS: Dict[str, Deque[float]] = defaultdict(deque)
RATE_LIMIT_LOCK = threading.Lock()

# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class RunScanResponse(BaseModel):
    scan_id: str
    count: int
    account: Optional[Dict[str, Any]] = None


class RunScanIn(BaseModel):
    region: str = "us-east-1"
    bucket_name: Optional[str] = None
    account_id: Optional[int] = None


class FixGuidanceIn(BaseModel):
    title: str
    summary: str
    consolePath: str
    steps: List[str]
    cli: List[str]
    terraform: str = ""


class FixGuidanceOut(FixGuidanceIn):
    check_id: str
    updated_at: str


class ActionIn(BaseModel):
    action: str
    note: str = ""


class ConnectedAccountIn(BaseModel):
    customer_name: str
    account_name: str
    aws_account_id: str
    role_arn: str
    external_id: str = ""
    region: str = "us-east-1"
    is_active: bool = True


class ConnectedAccountUpdateIn(BaseModel):
    customer_name: str
    account_name: str
    aws_account_id: str
    role_arn: str
    external_id: str = ""
    region: str = "us-east-1"
    status: str = "PENDING"
    is_active: bool = True


class LoginIn(BaseModel):
    email: str
    password: str


class RegisterIn(BaseModel):
    email: str
    password: str
    name: str


class CheckoutSessionIn(BaseModel):
    plan: str


class BillingPortalIn(BaseModel):
    return_url: Optional[str] = None


# ---------------------------------------------------------------------------
# DB helpers
# ---------------------------------------------------------------------------

def get_conn():
    conn = db_get_conn()
    try:
        conn.row_factory = sqlite3.Row
    except Exception:
        pass
    return conn


def now_utc_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode("utf-8")).hexdigest()


def verify_password(password: str, password_hash: str) -> bool:
    return hmac.compare_digest(hash_password(password), password_hash)


# ---------------------------------------------------------------------------
# Session helpers
# ---------------------------------------------------------------------------

def get_bearer_token(authorization: Optional[str]) -> Optional[str]:
    if not authorization:
        return None
    parts = authorization.strip().split(" ", 1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None
    return parts[1].strip()


def create_session(user_id: int) -> Dict[str, str]:
    token = secrets.token_urlsafe(32)
    created_at = datetime.now(timezone.utc)
    expires_at = created_at + timedelta(hours=SESSION_TTL_HOURS)

    conn = get_conn()
    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO auth_sessions (session_token, user_id, created_at, expires_at)
        VALUES (?, ?, ?, ?)
        """,
        (token, user_id, created_at.isoformat(), expires_at.isoformat()),
    )
    conn.commit()
    conn.close()

    return {
        "token": token,
        "created_at": created_at.isoformat(),
        "expires_at": expires_at.isoformat(),
    }


def delete_session(token: Optional[str]) -> None:
    if not token:
        return
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("DELETE FROM auth_sessions WHERE session_token = ?", (token,))
    conn.commit()
    conn.close()


def get_current_user(
    session_cookie: Optional[str],
    authorization: Optional[str],
) -> Dict[str, Any]:
    token = session_cookie or get_bearer_token(authorization)
    if not token:
        raise HTTPException(status_code=401, detail="Unauthorized")

    conn = get_conn()
    cur = conn.cursor()
    cur.execute(
        """
        SELECT
            s.session_token,
            s.expires_at,
            u.id,
            u.email,
            u.name,
            u.role,
            u.subscription_status,
            u.stripe_customer_id,
            u.stripe_subscription_id
        FROM auth_sessions s
        JOIN users u ON u.id = s.user_id
        WHERE s.session_token = ?
        """,
        (token,),
    )
    row = cur.fetchone()

    if not row:
        conn.close()
        raise HTTPException(status_code=401, detail="Unauthorized")

    try:
        expires_at = datetime.fromisoformat(row["expires_at"])
    except Exception:
        cur.execute("DELETE FROM auth_sessions WHERE session_token = ?", (token,))
        conn.commit()
        conn.close()
        raise HTTPException(status_code=401, detail="Invalid session")

    if expires_at <= datetime.now(timezone.utc):
        cur.execute("DELETE FROM auth_sessions WHERE session_token = ?", (token,))
        conn.commit()
        conn.close()
        raise HTTPException(status_code=401, detail="Session expired")

    user = {
        "id": row["id"],
        "email": row["email"],
        "name": row["name"],
        "role": row["role"],
        "session_token": row["session_token"],
        "subscription_status": row["subscription_status"],
        "stripe_customer_id": row["stripe_customer_id"],
        "stripe_subscription_id": row["stripe_subscription_id"],
    }
    conn.close()
    return user


# ---------------------------------------------------------------------------
# User / billing helpers
# ---------------------------------------------------------------------------

def get_account_limit_for_user(user: Dict[str, Any]) -> int:
    tier = (user.get("subscription_status") or "free").lower()
    return PLAN_ACCOUNT_LIMITS.get(tier, 1)


def get_plan_capabilities(plan: str) -> Dict[str, Any]:
    tier = (plan or "free").lower()
    return {
        "plan": tier,
        "account_limit": PLAN_ACCOUNT_LIMITS.get(tier, 1),
        "account_linked_scans": tier in {"starter", "pro", "msp", "pilot"},
        "exports": tier in {"starter", "pro", "msp", "pilot"},
    }


def count_connected_accounts(user_id: Optional[int] = None) -> int:
    conn = get_conn()
    if user_id is not None:
        row = conn.execute(
            "SELECT COUNT(*) AS c FROM connected_accounts WHERE user_id = ?",
            (user_id,),
        ).fetchone()
    else:
        row = conn.execute("SELECT COUNT(*) AS c FROM connected_accounts").fetchone()
    conn.close()
    return int(row["c"] if row else 0)


def upsert_user_billing(
    user_id: int,
    *,
    subscription_status: Optional[str] = None,
    stripe_customer_id: Optional[str] = None,
    stripe_subscription_id: Optional[str] = None,
) -> None:
    conn = get_conn()
    updates = []
    params = []

    if subscription_status is not None:
        updates.append("subscription_status = ?")
        params.append(subscription_status)
    if stripe_customer_id is not None:
        updates.append("stripe_customer_id = ?")
        params.append(stripe_customer_id)
    if stripe_subscription_id is not None:
        updates.append("stripe_subscription_id = ?")
        params.append(stripe_subscription_id)

    if not updates:
        conn.close()
        return

    params.append(user_id)
    conn.execute(f"UPDATE users SET {', '.join(updates)} WHERE id = ?", tuple(params))
    conn.commit()
    conn.close()


def find_user_by_stripe_customer(customer_id: str) -> Optional[Dict[str, Any]]:
    conn = get_conn()
    row = conn.execute(
        """
        SELECT
            id, email, name, role,
            subscription_status, stripe_customer_id, stripe_subscription_id
        FROM users
        WHERE stripe_customer_id = ?
        """,
        (customer_id,),
    ).fetchone()
    conn.close()
    return dict(row) if row else None


def find_user_by_id(user_id: int) -> Optional[Dict[str, Any]]:
    conn = get_conn()
    row = conn.execute(
        """
        SELECT
            id, email, name, role,
            subscription_status, stripe_customer_id, stripe_subscription_id
        FROM users
        WHERE id = ?
        """,
        (user_id,),
    ).fetchone()
    conn.close()
    return dict(row) if row else None


# ---------------------------------------------------------------------------
# Razorpay helpers
# ---------------------------------------------------------------------------

def get_razorpay_client() -> razorpay.Client:
    return razorpay.Client(auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET))


def resolve_plan_from_plan_id(plan_id: str) -> str:
    for plan, pid in RAZORPAY_PLAN_IDS.items():
        if pid and pid == plan_id:
            return plan
    return "free"


def verify_razorpay_payment_signature(payment_id: str, subscription_id: str, signature: str) -> bool:
    body = f"{payment_id}|{subscription_id}".encode()
    expected = hmac.new(RAZORPAY_KEY_SECRET.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)


def verify_razorpay_webhook_signature(payload: bytes, signature: str) -> bool:
    if not RAZORPAY_WEBHOOK_SECRET:
        return False
    expected = hmac.new(RAZORPAY_WEBHOOK_SECRET.encode(), payload, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)


def razorpay_config_summary() -> Dict[str, Any]:
    plan_info: Dict[str, Dict[str, Any]] = {}
    checkout_ready = bool(RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET)

    for plan, plan_id in RAZORPAY_PLAN_IDS.items():
        configured = bool(plan_id)
        plan_info[plan] = {"configured": configured, "plan_id": plan_id}
        if not configured:
            checkout_ready = False

    return {
        "configured": bool(RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET),
        "webhook_configured": bool(RAZORPAY_WEBHOOK_SECRET),
        "checkout_ready": checkout_ready,
        "plans": plan_info,
    }


def ensure_checkout_ready(plan: str) -> None:
    info = razorpay_config_summary()
    if not info["configured"]:
        raise HTTPException(status_code=500, detail="Razorpay is not configured")
    plan_info = info["plans"].get(plan)
    if not plan_info or not plan_info["configured"]:
        raise HTTPException(status_code=400, detail=f"Razorpay plan ID is not configured for plan '{plan}'")


def safe_return_url(url: Optional[str]) -> str:
    candidate = (url or "").strip()
    if not candidate:
        return f"{FRONTEND_URL}/plans"
    parsed_candidate = urlparse(candidate)
    parsed_frontend = urlparse(FRONTEND_URL)
    if parsed_candidate.scheme == parsed_frontend.scheme and parsed_candidate.netloc == parsed_frontend.netloc:
        return candidate
    return f"{FRONTEND_URL}/plans"


# ---------------------------------------------------------------------------
# Webhook event helpers
# ---------------------------------------------------------------------------

def webhook_event_exists(event_id: str) -> bool:
    conn = get_conn()
    row = conn.execute(
        "SELECT event_id FROM billing_webhook_events WHERE event_id = ?",
        (event_id,),
    ).fetchone()
    conn.close()
    return row is not None


def webhook_event_insert(
    *,
    event_id: str,
    event_type: str,
    livemode: bool,
    customer_id: str,
    subscription_id: str,
    payload_json: str,
) -> None:
    conn = get_conn()
    conn.execute(
        """
        INSERT INTO billing_webhook_events (
            event_id, event_type, livemode, customer_id, subscription_id,
            status, error_message, payload_json, received_at, processed_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            event_id,
            event_type,
            1 if livemode else 0,
            customer_id,
            subscription_id,
            "received",
            "",
            payload_json,
            now_utc_iso(),
            "",
        ),
    )
    conn.commit()
    conn.close()


def webhook_event_mark_processed(event_id: str) -> None:
    conn = get_conn()
    conn.execute(
        "UPDATE billing_webhook_events SET status = ?, processed_at = ?, error_message = '' WHERE event_id = ?",
        ("processed", now_utc_iso(), event_id),
    )
    conn.commit()
    conn.close()


def webhook_event_mark_failed(event_id: str, error_message: str) -> None:
    conn = get_conn()
    conn.execute(
        "UPDATE billing_webhook_events SET status = ?, processed_at = ?, error_message = ? WHERE event_id = ?",
        ("failed", now_utc_iso(), error_message[:1000], event_id),
    )
    conn.commit()
    conn.close()


# ---------------------------------------------------------------------------
# Rate limiting
# ---------------------------------------------------------------------------

def client_ip(request: Optional[Request]) -> str:
    if request is None:
        return "unknown"
    forwarded = request.headers.get("x-forwarded-for", "").strip()
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def enforce_rate_limit(key: str, limit: int, window_seconds: int) -> None:
    now_ts = time.time()
    with RATE_LIMIT_LOCK:
        bucket = RATE_LIMIT_BUCKETS[key]
        while bucket and bucket[0] <= now_ts - window_seconds:
            bucket.popleft()
        if len(bucket) >= limit:
            raise HTTPException(
                status_code=429,
                detail="Too many requests. Please wait and try again.",
            )
        bucket.append(now_ts)


# ---------------------------------------------------------------------------
# Input sanitizers
# ---------------------------------------------------------------------------

def sanitize_text(value: str, field_name: str, *, min_len: int = 1, max_len: int = 200) -> str:
    cleaned = " ".join((value or "").strip().split())
    if len(cleaned) < min_len:
        raise HTTPException(status_code=400, detail=f"{field_name} is required")
    if len(cleaned) > max_len:
        raise HTTPException(status_code=400, detail=f"{field_name} is too long")
    return cleaned


def sanitize_email(email: str) -> str:
    cleaned = (email or "").strip().lower()
    if not cleaned or len(cleaned) > 320 or "@" not in cleaned:
        raise HTTPException(status_code=400, detail="Valid email is required")
    return cleaned


def sanitize_password(password: str) -> str:
    if not password or len(password) < 6 or len(password) > 200:
        raise HTTPException(status_code=400, detail="Password must be between 6 and 200 characters")
    return password


def sanitize_region(region: str) -> str:
    cleaned = (region or "").strip()
    if not AWS_REGION_RE.match(cleaned):
        raise HTTPException(status_code=400, detail="Invalid AWS region")
    return cleaned


def sanitize_aws_account_id(account_id: str) -> str:
    cleaned = (account_id or "").strip()
    if not AWS_ACCOUNT_ID_RE.match(cleaned):
        raise HTTPException(status_code=400, detail="AWS Account ID must be 12 digits")
    return cleaned


def sanitize_role_arn(role_arn: str) -> str:
    cleaned = (role_arn or "").strip()
    if not ROLE_ARN_RE.match(cleaned):
        raise HTTPException(status_code=400, detail="Invalid IAM Role ARN")
    return cleaned


def sanitize_external_id(external_id: str) -> str:
    cleaned = (external_id or "").strip()
    if len(cleaned) > 256:
        raise HTTPException(status_code=400, detail="External ID is too long")
    return cleaned


def sanitize_bucket_name(bucket_name: Optional[str]) -> Optional[str]:
    if bucket_name is None:
        return None
    cleaned = bucket_name.strip().lower()
    if not cleaned:
        return None
    if len(cleaned) < 3 or len(cleaned) > 63 or not BUCKET_NAME_RE.match(cleaned):
        raise HTTPException(status_code=400, detail="Invalid S3 bucket name")
    return cleaned


def sanitize_note(note: str) -> str:
    cleaned = (note or "").strip()
    if len(cleaned) > 2000:
        raise HTTPException(status_code=400, detail="Note is too long")
    return cleaned


def sanitize_plan(plan: str) -> str:
    cleaned = (plan or "").strip().lower()
    if cleaned not in {"starter", "pro", "msp"}:
        raise HTTPException(status_code=400, detail="Invalid plan")
    return cleaned


# ---------------------------------------------------------------------------
# Account helpers
# ---------------------------------------------------------------------------

def normalize_account_row(account_row: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not account_row:
        return None
    out = dict(account_row)
    out["is_active"] = bool(out.get("is_active", 1))
    return out


def assume_account_credentials(account_row: Dict[str, Any]) -> Dict[str, Any]:
    assume_kwargs: Dict[str, Any] = {
        "RoleArn": account_row["role_arn"],
        "RoleSessionName": f"compliance-ai-scan-{account_row['id']}",
    }
    external_id = account_row.get("external_id")
    if external_id:
        assume_kwargs["ExternalId"] = external_id

    region_name = account_row.get("region") or "us-east-1"
    sts = boto3.client("sts", region_name=region_name)
    resp = sts.assume_role(**assume_kwargs)
    creds = resp["Credentials"]

    return {
        "aws_access_key_id": creds["AccessKeyId"],
        "aws_secret_access_key": creds["SecretAccessKey"],
        "aws_session_token": creds["SessionToken"],
        "expiration": creds["Expiration"].isoformat()
        if hasattr(creds["Expiration"], "isoformat")
        else str(creds["Expiration"]),
    }


def validate_account_or_404(account_id: Optional[int], user_id: Optional[int] = None) -> Optional[Dict[str, Any]]:
    if not account_id:
        return None
    row = get_connected_account(account_id, user_id=user_id)
    if not row:
        raise HTTPException(status_code=404, detail="Connected account not found")
    account = normalize_account_row(row)
    if not account:
        raise HTTPException(status_code=404, detail="Connected account not found")
    if not account.get("is_active", True):
        raise HTTPException(status_code=400, detail="Selected account is inactive")
    return account


# ---------------------------------------------------------------------------
# Scan access guards
# ---------------------------------------------------------------------------

def require_export_access(user: Dict[str, Any]) -> None:
    caps = get_plan_capabilities(user.get("subscription_status", "free"))
    if not caps["exports"]:
        raise HTTPException(
            status_code=403,
            detail="Your current plan does not allow exports. Upgrade your plan to export scan results.",
        )


def require_scan_owner(scan_id: str, user_id: int) -> Dict[str, Any]:
    s = get_scan(scan_id)
    if not s:
        raise HTTPException(status_code=404, detail="scan not found")
    if int(s.get("user_id", 1)) != user_id:
        raise HTTPException(status_code=404, detail="scan not found")
    return s


def require_account_linked_scan_access(user: Dict[str, Any]) -> None:
    caps = get_plan_capabilities(user.get("subscription_status", "free"))
    if not caps["account_linked_scans"]:
        raise HTTPException(
            status_code=403,
            detail="Your current plan does not allow account-linked scans. Upgrade your plan to scan connected accounts.",
        )


# ---------------------------------------------------------------------------
# Scan helpers
# ---------------------------------------------------------------------------

def enrich_scan(scan_row: Dict[str, Any]) -> Dict[str, Any]:
    scan_id = scan_row.get("scan_id")
    out = dict(scan_row)
    account_link = get_scan_account_link(scan_id) if scan_id else None
    out["account"] = account_link
    return out


def enrich_scans(scan_rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    result: List[Dict[str, Any]] = []
    for row in scan_rows:
        item = dict(row)
        item["account"] = (
            {
                "account_id": item.get("account_id"),
                "customer_name": item.get("customer_name"),
                "account_name": item.get("account_name"),
                "aws_account_id": item.get("aws_account_id"),
                "role_arn": item.get("role_arn"),
                "region": item.get("region"),
                "linked_at": item.get("linked_at"),
            }
            if item.get("account_id") is not None
            else None
        )
        result.append(item)
    return result


def _export_rows(scan_id: str) -> List[Dict[str, Any]]:
    findings = get_findings(scan_id)
    actions = get_actions(scan_id)
    actions_map = {(a["check_id"], a["resource_id"]): a for a in actions}
    account = get_scan_account_link(scan_id)

    rows: List[Dict[str, Any]] = []
    for f in findings:
        a = actions_map.get((f.get("check_id"), f.get("resource_id")))
        rows.append(
            {
                "scan_id": scan_id,
                "account_id": account.get("account_id") if account else "",
                "customer_name": account.get("customer_name") if account else "",
                "account_name": account.get("account_name") if account else "",
                "aws_account_id": account.get("aws_account_id") if account else "",
                "region": account.get("region") if account else "",
                "service": f.get("service", ""),
                "severity": f.get("severity", ""),
                "check_id": f.get("check_id", ""),
                "resource_id": f.get("resource_id", ""),
                "status": f.get("status", ""),
                "resolution": (a["resolution"] if a else ""),
                "note": (a["note"] if a else ""),
                "title": f.get("title", ""),
                "created_at": f.get("created_at", ""),
                "evidence": json.dumps(f.get("evidence", {})),
            }
        )
    return rows


# ---------------------------------------------------------------------------
# Email
# ---------------------------------------------------------------------------

def send_critical_findings_email(
    user_email: str,
    user_name: str,
    scan_id: str,
    critical_count: int,
    account_name: str = "",
) -> None:
    if not RESEND_API_KEY or not user_email:
        return
    try:
        import resend
        resend.api_key = RESEND_API_KEY
        subject = f"VigiliCloud: {critical_count} CRITICAL finding{'s' if critical_count != 1 else ''} detected"
        account_line = f" in <strong>{account_name}</strong>" if account_name else ""
        resend.Emails.send({
            "from": FROM_EMAIL,
            "to": user_email,
            "subject": subject,
            "html": f"""
            <div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#000;color:#fff;padding:32px;border-radius:12px">
              <div style="margin-bottom:24px">
                <span style="background:#10b981;color:#000;font-weight:bold;padding:4px 12px;border-radius:20px;font-size:12px">VigiliCloud</span>
              </div>
              <h1 style="font-size:24px;font-weight:bold;margin-bottom:16px">
                {critical_count} CRITICAL finding{'s' if critical_count != 1 else ''} detected{account_line}
              </h1>
              <p style="color:#9ca3af;margin-bottom:24px">
                Your latest AWS security scan found {critical_count} critical misconfiguration{'s' if critical_count != 1 else ''} that need immediate attention.
              </p>
              <a href="{FRONTEND_URL}/scans" style="background:#10b981;color:#000;font-weight:bold;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;margin-bottom:24px">
                View Findings →
              </a>
              <p style="color:#6b7280;font-size:12px;margin-top:24px">
                Scan ID: {scan_id} · <a href="{FRONTEND_URL}/plans" style="color:#10b981">Manage subscription</a>
              </p>
            </div>
            """,
        })
    except Exception:
        pass


def send_fix_request_email(
    assignee_email: str,
    actor_name: str,
    scan_id: str,
    check_id: str,
    resource_id: str,
    title: str,
    note: str = "",
) -> None:
    if not RESEND_API_KEY or not assignee_email:
        return
    try:
        import resend
        resend.api_key = RESEND_API_KEY
        note_line = f"<p style='color:#9ca3af'><strong>Note:</strong> {note}</p>" if note else ""
        resend.Emails.send({
            "from": FROM_EMAIL,
            "to": [assignee_email],
            "subject": f"VigiliCloud: Fix requested — {title}",
            "html": f"""
            <div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#000;color:#fff;padding:32px;border-radius:12px">
              <div style="margin-bottom:24px">
                <span style="background:#10b981;color:#000;font-weight:bold;padding:4px 12px;border-radius:20px;font-size:12px">VigiliCloud</span>
              </div>
              <h1 style="font-size:22px;font-weight:bold;margin-bottom:16px">Fix requested: {title}</h1>
              <p style="color:#9ca3af;margin-bottom:16px"><strong style="color:#fff">{actor_name}</strong> has requested a fix for the following compliance finding:</p>
              <ul style="color:#d1d5db;margin-bottom:16px;padding-left:20px">
                <li><strong>Check:</strong> {check_id}</li>
                <li><strong>Resource:</strong> {resource_id}</li>
              </ul>
              {note_line}
              <a href="{FRONTEND_URL}/scans" style="background:#10b981;color:#000;font-weight:bold;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;margin-top:16px">
                View in VigiliCloud →
              </a>
            </div>
            """,
        })
    except Exception:
        pass


# ---------------------------------------------------------------------------
# Scan runner
# ---------------------------------------------------------------------------

def run_account_scan(account: Dict[str, Any], user: Dict[str, Any]) -> None:
    try:
        env = dict(os.environ)
        env["PYTHONPATH"] = str(PROJECT_ROOT)
        env["AWS_DEFAULT_REGION"] = account.get("region") or "us-east-1"
        creds = assume_account_credentials(account)
        env["AWS_ACCESS_KEY_ID"] = creds["aws_access_key_id"]
        env["AWS_SECRET_ACCESS_KEY"] = creds["aws_secret_access_key"]
        env["AWS_SESSION_TOKEN"] = creds["aws_session_token"]

        p = subprocess.run(
            [PYTHON_EXE, str(SCANNER_PATH)],
            capture_output=True, text=True, env=env, timeout=300,
        )
        if p.returncode != 0:
            return

        data = json.loads(p.stdout)
        scan_id = data.get("scan_id", "")
        if not scan_id:
            return

        update_scan_user_id(scan_id, user["id"])
        save_scan_account_link(scan_id, account)

        findings = get_findings(scan_id)
        critical = [f for f in findings if f.get("severity") == "CRITICAL" and f.get("status") == "FAIL"]
        if critical:
            send_critical_findings_email(
                user_email=user.get("email", ""),
                user_name=user.get("name", ""),
                scan_id=scan_id,
                critical_count=len(critical),
                account_name=account.get("account_name", ""),
            )
    except Exception:
        pass


def run_scheduled_scans() -> None:
    try:
        conn = get_conn()
        users = conn.execute(
            "SELECT id, email, name, subscription_status FROM users"
        ).fetchall()
        conn.close()

        for user_row in users:
            user = dict(user_row)
            plan = user.get("subscription_status", "free")
            caps = get_plan_capabilities(plan)
            if not caps.get("account_linked_scans"):
                continue

            accounts = list_connected_accounts(user_id=user["id"])
            for account_row in accounts:
                account = normalize_account_row(dict(account_row))
                if account and account.get("is_active") and account.get("role_arn"):
                    run_account_scan(account, user)
    except Exception:
        pass


# ---------------------------------------------------------------------------
# Fix-guidance seed data
# ---------------------------------------------------------------------------

def _do_seed_fix_guidance() -> None:
    upsert_fix_guidance(
        "S3_PUBLIC_ACCESS_BLOCK_OFF",
        "Enable S3 Block Public Access",
        "Bucket has Block Public Access disabled. Enable all 4 settings.",
        "S3 → Buckets → <bucket> → Permissions → Block public access",
        [
            "Open S3 → Buckets → select bucket",
            "Open Permissions → Block public access",
            "Enable all 4 options",
            "Save changes",
            "Re-run scan",
        ],
        [
            "aws s3api put-public-access-block --bucket <bucket> --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"
        ],
        "",
    )

    upsert_fix_guidance(
        "S3_BUCKET_POLICY_PUBLIC",
        "Remove public bucket policy access",
        "Bucket policy allows public access and should be restricted.",
        "S3 → Buckets → <bucket> → Permissions → Bucket policy",
        [
            "Open the bucket policy",
            "Find the public statement using Principal '*'",
            "Remove or restrict it to trusted principals",
            "Save policy",
            "Re-run scan",
        ],
        [
            "aws s3api get-bucket-policy --bucket <bucket>",
            "aws s3api put-bucket-policy --bucket <bucket> --policy file://policy.json",
        ],
        "",
    )

    upsert_fix_guidance(
        "S3_BUCKET_ACL_PUBLIC",
        "Remove public ACL from bucket",
        "Bucket ACL grants public access and should be removed.",
        "S3 → Buckets → <bucket> → Permissions → ACL",
        [
            "Open bucket ACL settings",
            "Remove public grants",
            "Save changes",
            "Re-run scan",
        ],
        [
            "aws s3api get-bucket-acl --bucket <bucket>",
        ],
        "",
    )

    upsert_fix_guidance(
        "S3_WEBSITE_HOSTING_ENABLED",
        "Review static website hosting exposure",
        "Website hosting is enabled. Confirm whether this is intended.",
        "S3 → Buckets → <bucket> → Properties → Static website hosting",
        [
            "Open S3 bucket properties",
            "Review static website hosting settings",
            "Disable it if not needed",
            "Re-run scan",
        ],
        [
            "aws s3api get-bucket-website --bucket <bucket>",
            "aws s3api delete-bucket-website --bucket <bucket>",
        ],
        "",
    )

    upsert_fix_guidance(
        "IAM_ADMIN_MANAGED_POLICY",
        "Remove AdministratorAccess from IAM principal",
        "A user or role has AdministratorAccess. Replace with least privilege.",
        "IAM → Users/Roles → Permissions",
        [
            "Open IAM user or role",
            "Detach AdministratorAccess",
            "Attach only required policies",
            "Re-run scan",
        ],
        [
            "aws iam detach-user-policy --user-name <user> --policy-arn arn:aws:iam::aws:policy/AdministratorAccess",
        ],
        "",
    )

    upsert_fix_guidance(
        "EC2_SG_SSH_RDP_OPEN",
        "Restrict inbound SSH/RDP from internet",
        "Security group allows SSH or RDP from the internet.",
        "EC2 → Security Groups → Inbound rules",
        [
            "Open EC2 security groups",
            "Find inbound rule for 22 or 3389",
            "Remove 0.0.0.0/0 access",
            "Allow only trusted IPs",
            "Re-run scan",
        ],
        [
            "aws ec2 revoke-security-group-ingress --group-id <sg-id> --protocol tcp --port 22 --cidr 0.0.0.0/0",
        ],
        "",
    )

    upsert_fix_guidance(
        "EC2_SG_ALL_TRAFFIC_OPEN",
        "Remove world-open ALL traffic rule",
        "Security group allows all traffic from the internet.",
        "EC2 → Security Groups → Inbound rules",
        [
            "Open EC2 security group rules",
            "Remove ALL traffic rule exposed to internet",
            "Allow only required ports",
            "Re-run scan",
        ],
        [
            "aws ec2 revoke-security-group-ingress --group-id <sg-id> --ip-permissions 'IpProtocol=-1,IpRanges=[{CidrIp=0.0.0.0/0}]'",
        ],
        "",
    )

    upsert_fix_guidance(
        "EC2_EBS_DEFAULT_ENCRYPTION_OFF",
        "Enable EBS encryption by default",
        "Account-level EBS encryption by default is disabled.",
        "EC2 → Settings → EBS encryption",
        [
            "Open EC2 settings",
            "Enable EBS encryption by default",
            "Save settings",
            "Re-run scan",
        ],
        [
            "aws ec2 enable-ebs-encryption-by-default",
        ],
        "",
    )

    upsert_fix_guidance(
        "EC2_EBS_VOLUME_UNENCRYPTED",
        "Migrate unencrypted EBS volume",
        "EBS volume is not encrypted.",
        "EC2 → Volumes / Snapshots",
        [
            "Create snapshot of volume",
            "Copy snapshot with encryption",
            "Create new encrypted volume",
            "Swap volume carefully",
            "Re-run scan",
        ],
        [
            "aws ec2 create-snapshot --volume-id <vol-id>",
            "aws ec2 copy-snapshot --source-region <region> --source-snapshot-id <snap-id> --encrypted",
        ],
        "",
    )

    upsert_fix_guidance(
        "CLOUDTRAIL_NO_TRAIL",
        "Create a CloudTrail trail",
        "No CloudTrail trail exists in this region. All API activity is unlogged.",
        "CloudTrail → Trails → Create trail",
        [
            "Open CloudTrail → Trails → Create trail",
            "Enable multi-region trail for complete coverage",
            "Choose or create an S3 bucket for log storage",
            "Enable log file validation",
            "Enable CloudWatch Logs integration",
            "Save and verify trail is active",
            "Re-run scan",
        ],
        [
            "aws cloudtrail create-trail --name vigilicloud-trail --s3-bucket-name <bucket> --is-multi-region-trail",
            "aws cloudtrail start-logging --name vigilicloud-trail",
        ],
        "",
    )

    upsert_fix_guidance(
        "CLOUDTRAIL_NOT_LOGGING",
        "Enable CloudTrail logging",
        "A CloudTrail trail exists but is not currently logging.",
        "CloudTrail → Trails → select trail → Logging toggle",
        [
            "Open CloudTrail → Trails",
            "Select the affected trail",
            "Toggle Logging to ON",
            "Confirm the change",
            "Re-run scan",
        ],
        [
            "aws cloudtrail start-logging --name <trail-name>",
        ],
        "",
    )

    upsert_fix_guidance(
        "CLOUDTRAIL_NOT_MULTI_REGION",
        "Enable multi-region CloudTrail",
        "Trail only covers one region. Activity in other regions is not logged.",
        "CloudTrail → Trails → Edit trail",
        [
            "Open CloudTrail → Trails",
            "Edit the trail",
            "Enable Apply trail to all regions",
            "Save changes",
            "Re-run scan",
        ],
        [
            "aws cloudtrail update-trail --name <trail-name> --is-multi-region-trail",
        ],
        "",
    )

    upsert_fix_guidance(
        "CLOUDTRAIL_LOG_VALIDATION_DISABLED",
        "Enable CloudTrail log file validation",
        "Log file validation is off. Logs can be tampered without detection.",
        "CloudTrail → Trails → Edit trail → Log file validation",
        [
            "Open CloudTrail → Trails → Edit",
            "Enable Log file validation",
            "Save changes",
            "Re-run scan",
        ],
        [
            "aws cloudtrail update-trail --name <trail-name> --enable-log-file-validation",
        ],
        "",
    )

    upsert_fix_guidance(
        "RDS_STORAGE_NOT_ENCRYPTED",
        "Enable RDS storage encryption",
        "RDS instance storage is not encrypted at rest. Encryption cannot be enabled on a running instance — requires snapshot restore.",
        "RDS → Databases → Actions → Take snapshot, then restore with encryption",
        [
            "Take a snapshot of the unencrypted DB instance",
            "Copy the snapshot with encryption enabled",
            "Restore a new DB instance from the encrypted snapshot",
            "Update application connection strings",
            "Delete the old unencrypted instance",
            "Re-run scan",
        ],
        [
            "aws rds create-db-snapshot --db-instance-identifier <db-id> --db-snapshot-identifier <snap-id>",
            "aws rds copy-db-snapshot --source-db-snapshot-identifier <snap-id> --target-db-snapshot-identifier <encrypted-snap-id> --kms-key-id <kms-key>",
            "aws rds restore-db-instance-from-db-snapshot --db-instance-identifier <new-db-id> --db-snapshot-identifier <encrypted-snap-id>",
        ],
        "",
    )

    upsert_fix_guidance(
        "RDS_PUBLICLY_ACCESSIBLE",
        "Disable RDS public accessibility",
        "RDS instance is publicly accessible from the internet. It should only be reachable within your VPC.",
        "RDS → Databases → Modify → Connectivity → Public access",
        [
            "Open RDS → Databases → select instance → Modify",
            "Under Connectivity expand Additional configuration",
            "Set Public access to No",
            "Apply immediately",
            "Re-run scan",
        ],
        [
            "aws rds modify-db-instance --db-instance-identifier <db-id> --no-publicly-accessible --apply-immediately",
        ],
        "",
    )

    upsert_fix_guidance(
        "IAM_USER_NO_MFA",
        "Enable MFA for IAM user",
        "IAM user has no MFA device. If credentials are compromised, the account has no second factor.",
        "IAM → Users → select user → Security credentials → MFA device",
        [
            "Open IAM → Users → select user",
            "Go to Security credentials tab",
            "Click Assign MFA device",
            "Choose Virtual MFA device (Google Authenticator / Authy)",
            "Scan QR code and enter two consecutive codes",
            "Save",
            "Re-run scan",
        ],
        [
            "aws iam create-virtual-mfa-device --virtual-mfa-device-name <device-name> --outfile /tmp/qrcode.png --bootstrap-method QRCodePNG",
            "aws iam enable-mfa-device --user-name <user> --serial-number <arn> --authentication-code1 <code1> --authentication-code2 <code2>",
        ],
        "",
    )

    upsert_fix_guidance(
        "IAM_ROOT_NO_MFA",
        "Enable MFA on the AWS root account",
        "The root account has no MFA. This is a critical risk — root has unrestricted access to everything.",
        "AWS Console → Account menu (top right) → Security credentials → MFA",
        [
            "Sign in as the root account",
            "Click account name (top right) → Security credentials",
            "Under Multi-factor authentication (MFA) click Assign MFA device",
            "Choose hardware or virtual MFA",
            "Complete the setup and test login with MFA",
        ],
        [],
        "",
    )
