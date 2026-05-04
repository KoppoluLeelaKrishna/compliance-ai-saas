from __future__ import annotations

import csv
import hashlib
import hmac
import io
import json
import os
import re
import secrets
import sqlite3
import subprocess
import sys
import threading
import time
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Deque, Dict, List, Optional
from urllib.parse import urlparse

import boto3
import stripe
from dotenv import load_dotenv
from fastapi import Body, Cookie, FastAPI, Header, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel

load_dotenv()

PROJECT_ROOT = Path(__file__).resolve().parents[2]
SCANNER_PATH = PROJECT_ROOT / "worker" / "src" / "runner.py"
PYTHON_EXE = sys.executable

if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

APP_ENV = os.getenv("APP_ENV", "local").strip().lower()
DATABASE_URL = os.getenv("DATABASE_URL", "").strip()
USE_POSTGRES = APP_ENV == "production" and bool(DATABASE_URL)

if USE_POSTGRES:
    from worker.src.utils.db_postgres import (  # noqa: E402
        create_connected_account,
        delete_connected_account,
        get_actions,
        get_connected_account,
        get_conn as db_get_conn,
        get_findings,
        get_fix_guidance,
        get_scan,
        get_scan_account_link,
        init_db,
        list_connected_accounts,
        list_scans,
        save_scan_account_link,
        update_connected_account,
        update_connected_account_status,
        upsert_action,
        upsert_fix_guidance,
    )
else:
    from worker.src.utils.db_sqlite import (  # noqa: E402
        create_connected_account,
        delete_connected_account,
        get_actions,
        get_connected_account,
        get_conn as db_get_conn,
        get_findings,
        get_fix_guidance,
        get_scan,
        get_scan_account_link,
        init_db,
        list_connected_accounts,
        list_scans,
        save_scan_account_link,
        update_connected_account,
        update_connected_account_status,
        upsert_action,
        upsert_fix_guidance,
    )

AWS_REGION_RE = re.compile(r"^[a-z]{2}-[a-z]+-\d+$")
AWS_ACCOUNT_ID_RE = re.compile(r"^\d{12}$")
ROLE_ARN_RE = re.compile(r"^arn:aws:iam::\d{12}:role\/[A-Za-z0-9+=,.@_\-/]+$")
BUCKET_NAME_RE = re.compile(r"^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$")

RATE_LIMIT_BUCKETS: Dict[str, Deque[float]] = defaultdict(deque)
RATE_LIMIT_LOCK = threading.Lock()

LOGIN_RATE_LIMIT = (10, 300)
SCAN_RATE_LIMIT = (20, 300)
BILLING_RATE_LIMIT = (30, 300)
WEBHOOK_RATE_LIMIT = (120, 300)


def env_bool(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def build_cors_origins() -> List[str]:
    origins: List[str] = []

    frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000").strip().rstrip("/")
    if frontend_url:
        origins.append(frontend_url)

    extra = os.getenv("CORS_ORIGINS", "").strip()
    if extra:
        origins.extend([item.strip().rstrip("/") for item in extra.split(",") if item.strip()])

    
    if APP_ENV != "production":
        origins.extend(
            [
                "http://localhost:3000",
                "http://127.0.0.1:3000",
            ]
        )

    deduped: List[str] = []
    seen = set()
    for item in origins:
        if item and item not in seen:
            deduped.append(item)
            seen.add(item)

    return deduped



IS_PRODUCTION = APP_ENV == "production"

SESSION_COOKIE_NAME = "compliance_session"
SESSION_TTL_HOURS = 12

DEFAULT_ADMIN_EMAIL = "admin@compliance.local"
DEFAULT_ADMIN_PASSWORD = "admin123"
DEFAULT_ADMIN_NAME = "Admin User"

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000").strip().rstrip("/")
COOKIE_SECURE = env_bool("COOKIE_SECURE", IS_PRODUCTION)
COOKIE_SAMESITE = "none" if COOKIE_SECURE else "lax"
CORS_ORIGINS = build_cors_origins()

STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY", "").strip()
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET", "").strip()

STRIPE_PRICE_STARTER = os.getenv("STRIPE_PRICE_STARTER", "").strip()
STRIPE_PRICE_PRO = os.getenv("STRIPE_PRICE_PRO", "").strip()
STRIPE_PRICE_MSP = os.getenv("STRIPE_PRICE_MSP", "").strip()

stripe.api_key = STRIPE_SECRET_KEY

PLAN_PRICE_IDS = {
    "starter": STRIPE_PRICE_STARTER,
    "pro": STRIPE_PRICE_PRO,
    "msp": STRIPE_PRICE_MSP,
}

PLAN_ACCOUNT_LIMITS = {
    "free": 1,
    "starter": 3,
    "pilot": 2,
    "pro": 10,
    "msp": 999999,
}

app = FastAPI(title="VigiliCloud API", version="0.4.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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


def add_user_column_if_missing(conn, column_name: str, ddl: str) -> None:
    rows = conn.execute("PRAGMA table_info(users)").fetchall()
    cols = [str(r["name"]) for r in rows]
    if column_name not in cols:
        conn.execute(f"ALTER TABLE users ADD COLUMN {ddl}")


def ensure_auth_tables() -> None:
    conn = get_conn()
    cur = conn.cursor()

    if USE_POSTGRES:
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
                email TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                name TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'admin',
                created_at TEXT NOT NULL
            )
            """
        )
    else:
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                name TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'admin',
                created_at TEXT NOT NULL
            )
            """
        )

    add_user_column_if_missing(
        conn,
        "subscription_status",
        "subscription_status TEXT NOT NULL DEFAULT 'free'",
    )
    add_user_column_if_missing(
        conn,
        "stripe_customer_id",
        "stripe_customer_id TEXT NOT NULL DEFAULT ''",
    )
    add_user_column_if_missing(
        conn,
        "stripe_subscription_id",
        "stripe_subscription_id TEXT NOT NULL DEFAULT ''",
    )

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS auth_sessions (
            session_token TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            created_at TEXT NOT NULL,
            expires_at TEXT NOT NULL
        )
        """
    )

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS billing_webhook_events (
            event_id TEXT PRIMARY KEY,
            event_type TEXT NOT NULL,
            livemode INTEGER NOT NULL DEFAULT 0,
            customer_id TEXT NOT NULL DEFAULT '',
            subscription_id TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'received',
            error_message TEXT NOT NULL DEFAULT '',
            payload_json TEXT NOT NULL,
            received_at TEXT NOT NULL,
            processed_at TEXT NOT NULL DEFAULT ''
        )
        """
    )

    conn.commit()

    cur.execute("SELECT id FROM users WHERE lower(email) = lower(?)", (DEFAULT_ADMIN_EMAIL,))
    row = cur.fetchone()
    if not row:
        cur.execute(
            """
            INSERT INTO users (
                email,
                password_hash,
                name,
                role,
                created_at,
                subscription_status,
                stripe_customer_id,
                stripe_subscription_id
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                DEFAULT_ADMIN_EMAIL,
                hash_password(DEFAULT_ADMIN_PASSWORD),
                DEFAULT_ADMIN_NAME,
                "admin",
                now_utc_iso(),
                "free",
                "",
                "",
            ),
        )
        conn.commit()

    conn.close()


def normalize_account_row(account_row: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not account_row:
        return None
    out = dict(account_row)
    out["is_active"] = bool(out.get("is_active", 1))
    return out


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


def count_connected_accounts() -> int:
    conn = get_conn()
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
            id,
            email,
            name,
            role,
            subscription_status,
            stripe_customer_id,
            stripe_subscription_id
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
            id,
            email,
            name,
            role,
            subscription_status,
            stripe_customer_id,
            stripe_subscription_id
        FROM users
        WHERE id = ?
        """,
        (user_id,),
    ).fetchone()
    conn.close()
    return dict(row) if row else None


def stripe_value(obj: Any, key: str, default: Any = None) -> Any:
    try:
        if obj is None:
            return default
        if isinstance(obj, dict):
            return obj.get(key, default)
        if hasattr(obj, key):
            return getattr(obj, key)
        if hasattr(obj, "get"):
            return obj.get(key, default)
        return default
    except Exception:
        return default


def stripe_metadata_dict(obj: Any) -> Dict[str, Any]:
    meta = stripe_value(obj, "metadata", {})
    try:
        if meta is None:
            return {}
        if isinstance(meta, dict):
            return dict(meta)
        if hasattr(meta, "to_dict"):
            return dict(meta.to_dict())
        return dict(meta)
    except Exception:
        return {}


def resolve_plan_from_price_id(price_id: str) -> str:
    for plan, pid in PLAN_PRICE_IDS.items():
        if pid and pid == price_id:
            return plan
    return "free"


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


def validate_account_or_404(account_id: Optional[int]) -> Optional[Dict[str, Any]]:
    if not account_id:
        return None

    row = get_connected_account(account_id)
    if not row:
        raise HTTPException(status_code=404, detail="Connected account not found")

    account = normalize_account_row(row)
    if not account:
        raise HTTPException(status_code=404, detail="Connected account not found")

    if not account.get("is_active", True):
        raise HTTPException(status_code=400, detail="Selected account is inactive")

    return account


def require_export_access(user: Dict[str, Any]) -> None:
    caps = get_plan_capabilities(user.get("subscription_status", "free"))
    if not caps["exports"]:
        raise HTTPException(
            status_code=403,
            detail="Your current plan does not allow exports. Upgrade your plan to export scan results.",
        )


def require_account_linked_scan_access(user: Dict[str, Any]) -> None:
    caps = get_plan_capabilities(user.get("subscription_status", "free"))
    if not caps["account_linked_scans"]:
        raise HTTPException(
            status_code=403,
            detail="Your current plan does not allow account-linked scans. Upgrade your plan to scan connected accounts.",
        )


def stripe_mode() -> str:
    if not STRIPE_SECRET_KEY:
        return "disabled"
    if STRIPE_SECRET_KEY.startswith("sk_live_"):
        return "live"
    if STRIPE_SECRET_KEY.startswith("sk_test_"):
        return "test"
    return "unknown"


def price_matches_mode(price_id: str) -> bool:
    if not price_id:
        return False
    mode = stripe_mode()
    if mode in {"live", "test"}:
        return price_id.startswith("price_")
    return False


def stripe_config_summary() -> Dict[str, Any]:
    mode = stripe_mode()
    price_info: Dict[str, Dict[str, Any]] = {}

    checkout_ready = bool(STRIPE_SECRET_KEY)
    for plan, price_id in PLAN_PRICE_IDS.items():
        configured = bool(price_id)
        matches = price_matches_mode(price_id) if configured else False
        price_info[plan] = {
            "configured": configured,
            "matches_mode": matches,
            "price_id": price_id,
        }
        if not configured or not matches:
            checkout_ready = False

    return {
        "configured": bool(STRIPE_SECRET_KEY),
        "mode": mode,
        "webhook_configured": bool(STRIPE_WEBHOOK_SECRET),
        "checkout_ready": checkout_ready,
        "portal_ready": bool(STRIPE_SECRET_KEY),
        "prices": price_info,
    }


def ensure_checkout_ready(plan: str) -> None:
    info = stripe_config_summary()

    if not info["configured"]:
        raise HTTPException(status_code=500, detail="Stripe is not configured")

    plan_info = info["prices"].get(plan)
    if not plan_info or not plan_info["configured"]:
        raise HTTPException(status_code=400, detail=f"Price ID is not configured for plan '{plan}'")

    if not plan_info["matches_mode"]:
        raise HTTPException(
            status_code=400,
            detail=f"Stripe price for plan '{plan}' does not match the current Stripe mode",
        )


def safe_return_url(url: Optional[str]) -> str:
    candidate = (url or "").strip()
    if not candidate:
        return f"{FRONTEND_URL}/plans"

    parsed_candidate = urlparse(candidate)
    parsed_frontend = urlparse(FRONTEND_URL)

    same_scheme = parsed_candidate.scheme == parsed_frontend.scheme
    same_host = parsed_candidate.netloc == parsed_frontend.netloc
    if same_scheme and same_host:
        return candidate

    return f"{FRONTEND_URL}/plans"


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
            event_id,
            event_type,
            livemode,
            customer_id,
            subscription_id,
            status,
            error_message,
            payload_json,
            received_at,
            processed_at
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
        """
        UPDATE billing_webhook_events
        SET status = ?, processed_at = ?, error_message = ''
        WHERE event_id = ?
        """,
        ("processed", now_utc_iso(), event_id),
    )
    conn.commit()
    conn.close()


def webhook_event_mark_failed(event_id: str, error_message: str) -> None:
    conn = get_conn()
    conn.execute(
        """
        UPDATE billing_webhook_events
        SET status = ?, processed_at = ?, error_message = ?
        WHERE event_id = ?
        """,
        ("failed", now_utc_iso(), error_message[:1000], event_id),
    )
    conn.commit()
    conn.close()


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



@app.on_event("startup")
def startup() -> None:
    init_db()
    ensure_auth_tables()


@app.get("/health")
def health():
    stripe_info = stripe_config_summary()
    return {
        "ok": True,
        "app_env": APP_ENV,
        "frontend_url": FRONTEND_URL,
        "cookie_secure": COOKIE_SECURE,
        "cors_origins": CORS_ORIGINS,
        "stripe": {
            "configured": stripe_info["configured"],
            "mode": stripe_info["mode"],
            "webhook_configured": stripe_info["webhook_configured"],
            "checkout_ready": stripe_info["checkout_ready"],
            "portal_ready": stripe_info["portal_ready"],
        },
    }


@app.get("/")
def root():
    return {
        "name": "VigiliCloud API",
        "version": "0.4.0",
        "app_env": APP_ENV,
        "frontend_url": FRONTEND_URL,
        "auth": "enabled",
        "billing": "deployment_ready",
    }


@app.post("/auth/login")
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


@app.post("/auth/register")
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


@app.post("/auth/logout")
def auth_logout(
    session_cookie: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
    authorization: Optional[str] = Header(default=None),
):
    token = session_cookie or get_bearer_token(authorization)
    delete_session(token)

    response = JSONResponse({"ok": True})
    response.delete_cookie(key=SESSION_COOKIE_NAME, path="/")
    return response


@app.get("/auth/me")
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


@app.get("/billing/me")
def billing_me(
    session_cookie: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
    authorization: Optional[str] = Header(default=None),
):
    user = get_current_user(session_cookie, authorization)
    capabilities = get_plan_capabilities(user.get("subscription_status", "free"))
    connected_accounts_used = count_connected_accounts()

    return {
        "subscription_status": user.get("subscription_status", "free"),
        "stripe_customer_id": user.get("stripe_customer_id", ""),
        "stripe_subscription_id": user.get("stripe_subscription_id", ""),
        "account_limit": capabilities["account_limit"],
        "connected_accounts_used": connected_accounts_used,
        "capabilities": {
            "account_linked_scans": capabilities["account_linked_scans"],
            "exports": capabilities["exports"],
        },
        "plans": [
            {"key": "starter", "label": "Starter", "price_id": STRIPE_PRICE_STARTER},
            {"key": "pro", "label": "Pro", "price_id": STRIPE_PRICE_PRO},
            {"key": "msp", "label": "MSP", "price_id": STRIPE_PRICE_MSP},
        ],
        "stripe": stripe_config_summary(),
    }


@app.post("/billing/sync")
def billing_sync(
    request: Request,
    session_cookie: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
    authorization: Optional[str] = Header(default=None),
):
    ip = client_ip(request)
    enforce_rate_limit(f"billing-sync:{ip}", BILLING_RATE_LIMIT[0], BILLING_RATE_LIMIT[1])

    user = get_current_user(session_cookie, authorization)

    if not STRIPE_SECRET_KEY:
        capabilities = get_plan_capabilities(user.get("subscription_status", "free"))
        return {
            "subscription_status": user.get("subscription_status", "free"),
            "stripe_customer_id": user.get("stripe_customer_id", ""),
            "stripe_subscription_id": user.get("stripe_subscription_id", ""),
            "account_limit": capabilities["account_limit"],
            "connected_accounts_used": count_connected_accounts(),
            "capabilities": {
                "account_linked_scans": capabilities["account_linked_scans"],
                "exports": capabilities["exports"],
            },
            "stripe": stripe_config_summary(),
            "synced": False,
        }

    customer_id = user.get("stripe_customer_id") or ""
    subscription_id = user.get("stripe_subscription_id") or ""

    final_plan = user.get("subscription_status", "free")
    final_subscription_id = subscription_id

    try:
        if subscription_id:
            sub = stripe.Subscription.retrieve(subscription_id)
            status = str(stripe_value(sub, "status", "") or "").lower()

            items = stripe_value(sub, "items", {})
            items_data = stripe_value(items, "data", []) or []
            price_id = ""
            if items_data:
                first_item = items_data[0]
                price_obj = stripe_value(first_item, "price", {})
                price_id = stripe_value(price_obj, "id", "") or ""

            mapped_plan = resolve_plan_from_price_id(price_id)
            final_plan = mapped_plan if status in ("active", "trialing") else "free"
            final_subscription_id = stripe_value(sub, "id", "") or final_subscription_id

        elif customer_id:
            subs = stripe.Subscription.list(customer=customer_id, limit=10)
            subs_data = stripe_value(subs, "data", []) or []

            active_sub = None
            for sub in subs_data:
                status = str(stripe_value(sub, "status", "") or "").lower()
                if status in ("active", "trialing"):
                    active_sub = sub
                    break

            if active_sub:
                items = stripe_value(active_sub, "items", {})
                items_data = stripe_value(items, "data", []) or []
                price_id = ""
                if items_data:
                    first_item = items_data[0]
                    price_obj = stripe_value(first_item, "price", {})
                    price_id = stripe_value(price_obj, "id", "") or ""

                final_plan = resolve_plan_from_price_id(price_id)
                final_subscription_id = stripe_value(active_sub, "id", "") or ""
            else:
                final_plan = "free"
                final_subscription_id = ""

        upsert_user_billing(
            user_id=user["id"],
            subscription_status=final_plan,
            stripe_subscription_id=final_subscription_id,
        )

    except Exception:
        pass

    refreshed_user = find_user_by_id(user["id"]) or user
    capabilities = get_plan_capabilities(refreshed_user.get("subscription_status", "free"))

    return {
        "subscription_status": refreshed_user.get("subscription_status", "free"),
        "stripe_customer_id": refreshed_user.get("stripe_customer_id", ""),
        "stripe_subscription_id": refreshed_user.get("stripe_subscription_id", ""),
        "account_limit": capabilities["account_limit"],
        "connected_accounts_used": count_connected_accounts(),
        "capabilities": {
            "account_linked_scans": capabilities["account_linked_scans"],
            "exports": capabilities["exports"],
        },
        "stripe": stripe_config_summary(),
        "synced": True,
    }


@app.post("/billing/create-checkout-session")
def create_checkout_session(
    payload: CheckoutSessionIn,
    request: Request,
    session_cookie: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
    authorization: Optional[str] = Header(default=None),
):
    ip = client_ip(request)
    enforce_rate_limit(f"checkout:{ip}", BILLING_RATE_LIMIT[0], BILLING_RATE_LIMIT[1])

    user = get_current_user(session_cookie, authorization)
    plan = sanitize_plan(payload.plan)
    ensure_checkout_ready(plan)

    try:
        stripe_customer_id = user.get("stripe_customer_id") or ""

        if not stripe_customer_id:
            customer = stripe.Customer.create(
                email=user["email"],
                name=user["name"],
                metadata={"user_id": str(user["id"])},
            )
            stripe_customer_id = customer["id"]
            upsert_user_billing(user["id"], stripe_customer_id=stripe_customer_id)

        session = stripe.checkout.Session.create(
            mode="subscription",
            customer=stripe_customer_id,
            line_items=[{"price": PLAN_PRICE_IDS[plan], "quantity": 1}],
            success_url=f"{FRONTEND_URL}/plans?checkout=success",
            cancel_url=f"{FRONTEND_URL}/plans?checkout=cancelled",
            metadata={
                "user_id": str(user["id"]),
                "plan": plan,
                "app_env": APP_ENV,
            },
            allow_promotion_codes=True,
        )

        return {"url": session.url}

    except stripe.error.StripeError as e:
        msg = getattr(e, "user_message", None) or str(e)
        raise HTTPException(status_code=400, detail=f"Stripe error: {msg}")

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Checkout session failed: {str(e)}")


@app.post("/billing/portal")
def create_billing_portal(
    payload: BillingPortalIn,
    request: Request,
    session_cookie: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
    authorization: Optional[str] = Header(default=None),
):
    ip = client_ip(request)
    enforce_rate_limit(f"portal:{ip}", BILLING_RATE_LIMIT[0], BILLING_RATE_LIMIT[1])

    user = get_current_user(session_cookie, authorization)

    if not STRIPE_SECRET_KEY:
        raise HTTPException(status_code=500, detail="Stripe is not configured")

    customer_id = user.get("stripe_customer_id") or ""
    if not customer_id:
        raise HTTPException(status_code=400, detail="No Stripe customer found for this user")

    portal = stripe.billing_portal.Session.create(
        customer=customer_id,
        return_url=safe_return_url(payload.return_url),
    )
    return {"url": portal.url}


@app.post("/billing/webhook")
async def billing_webhook(request: Request):
    ip = client_ip(request)
    enforce_rate_limit(f"webhook:{ip}", WEBHOOK_RATE_LIMIT[0], WEBHOOK_RATE_LIMIT[1])

    if not STRIPE_WEBHOOK_SECRET:
        raise HTTPException(status_code=500, detail="Stripe webhook secret not configured")

    payload = await request.body()
    sig_header = request.headers.get("stripe-signature")

    try:
        event = stripe.Webhook.construct_event(
            payload=payload,
            sig_header=sig_header,
            secret=STRIPE_WEBHOOK_SECRET,
        )
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid payload")
    except stripe.error.SignatureVerificationError:
        raise HTTPException(status_code=400, detail="Invalid signature")

    event_id = str(stripe_value(event, "id", "") or "")
    event_type = str(stripe_value(event, "type", "") or "")
    event_data = stripe_value(event, "data", {})
    data = stripe_value(event_data, "object", None)
    livemode = bool(stripe_value(event, "livemode", False))

    if not event_id:
        raise HTTPException(status_code=400, detail="Webhook event id missing")

    if webhook_event_exists(event_id):
        return {"received": True, "duplicate": True, "event_id": event_id, "type": event_type}

    customer_id = str(stripe_value(data, "customer", "") or "")
    subscription_id = str(
        stripe_value(data, "subscription", "") or stripe_value(data, "id", "") or ""
    )

    webhook_event_insert(
        event_id=event_id,
        event_type=event_type,
        livemode=livemode,
        customer_id=customer_id,
        subscription_id=subscription_id,
        payload_json=payload.decode("utf-8", errors="ignore"),
    )

    try:
        if event_type == "checkout.session.completed":
            metadata = stripe_metadata_dict(data)
            plan = str(metadata.get("plan", "starter")).lower()
            user_id_raw = metadata.get("user_id")

            user = None
            if customer_id:
                user = find_user_by_stripe_customer(customer_id)

            if not user and user_id_raw:
                try:
                    user = find_user_by_id(int(user_id_raw))
                except Exception:
                    user = None

            if user:
                upsert_user_billing(
                    user_id=user["id"],
                    stripe_customer_id=customer_id or user.get("stripe_customer_id", ""),
                    stripe_subscription_id=str(stripe_value(data, "subscription", "") or ""),
                    subscription_status=plan,
                )

        elif event_type in (
            "customer.subscription.created",
            "customer.subscription.updated",
            "invoice.paid",
        ):
            sub_obj = data

            if event_type == "invoice.paid":
                subscription_from_invoice = stripe_value(data, "subscription", "")
                if subscription_from_invoice:
                    sub_obj = stripe.Subscription.retrieve(subscription_from_invoice)

            customer_id = str(stripe_value(sub_obj, "customer", "") or customer_id)
            subscription_id = str(stripe_value(sub_obj, "id", "") or subscription_id)
            status = str(stripe_value(sub_obj, "status", "") or "").lower()

            price_id = ""
            items = stripe_value(sub_obj, "items", {})
            items_data = stripe_value(items, "data", []) or []

            if items_data:
                first_item = items_data[0]
                price_obj = stripe_value(first_item, "price", {})
                price_id = str(stripe_value(price_obj, "id", "") or "")

            mapped_plan = resolve_plan_from_price_id(price_id)

            if customer_id:
                user = find_user_by_stripe_customer(customer_id)
                if user:
                    final_status = mapped_plan if status in ("active", "trialing") else "free"
                    upsert_user_billing(
                        user_id=user["id"],
                        stripe_customer_id=customer_id,
                        stripe_subscription_id=subscription_id,
                        subscription_status=final_status,
                    )

        elif event_type in (
            "customer.subscription.deleted",
            "customer.subscription.paused",
            "invoice.payment_failed",
        ):
            if customer_id:
                user = find_user_by_stripe_customer(customer_id)
                if user:
                    upsert_user_billing(
                        user_id=user["id"],
                        stripe_customer_id=customer_id,
                        stripe_subscription_id=stripe_value(data, "id", "") or "",
                        subscription_status="free",
                    )

        webhook_event_mark_processed(event_id)
        return {"received": True, "event_id": event_id, "type": event_type}

    except Exception as e:
        webhook_event_mark_failed(event_id, str(e))
        return {
            "received": True,
            "event_id": event_id,
            "type": event_type,
            "warning": str(e),
        }


@app.get("/fix-guidance/{check_id}", response_model=FixGuidanceOut)
def read_fix_guidance(
    check_id: str,
    session_cookie: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
    authorization: Optional[str] = Header(default=None),
):
    get_current_user(session_cookie, authorization)

    g = get_fix_guidance(check_id)
    if not g:
        raise HTTPException(status_code=404, detail="No fix guidance found")
    return g


@app.post("/fix-guidance/seed")
def seed_fix_guidance(
    payload: Optional[Dict[str, Any]] = Body(default=None),
    session_cookie: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
    authorization: Optional[str] = Header(default=None),
):
    get_current_user(session_cookie, authorization)

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

    return {"status": "ok"}


@app.post("/fix-guidance/{check_id}", response_model=FixGuidanceOut)
def write_fix_guidance(
    check_id: str,
    payload: FixGuidanceIn,
    session_cookie: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
    authorization: Optional[str] = Header(default=None),
):
    get_current_user(session_cookie, authorization)

    upsert_fix_guidance(
        check_id=check_id,
        title=sanitize_text(payload.title, "title", max_len=200),
        summary=sanitize_text(payload.summary, "summary", max_len=1000),
        console_path=sanitize_text(payload.consolePath, "consolePath", max_len=500),
        steps=[sanitize_text(step, "step", max_len=500) for step in payload.steps],
        cli=[sanitize_text(cmd, "cli", max_len=1000) for cmd in payload.cli],
        terraform=(payload.terraform or "")[:10000],
    )
    return get_fix_guidance(check_id)


@app.post("/scans/run", response_model=RunScanResponse)
def run_scan(
    request: Request,
    payload: Optional[RunScanIn] = Body(default=None),
    session_cookie: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
    authorization: Optional[str] = Header(default=None),
):
    user = get_current_user(session_cookie, authorization)
    rate_key = f"scan:{user['id']}:{client_ip(request)}"
    enforce_rate_limit(rate_key, SCAN_RATE_LIMIT[0], SCAN_RATE_LIMIT[1])

    payload = payload or RunScanIn()
    region = sanitize_region(payload.region)
    bucket_name = sanitize_bucket_name(payload.bucket_name)

    env = dict(os.environ)
    env["PYTHONPATH"] = str(PROJECT_ROOT)
    env["AWS_DEFAULT_REGION"] = region

    if bucket_name:
        env["BUCKET_NAME"] = bucket_name

    if payload.account_id:
        require_account_linked_scan_access(user)

    selected_account = validate_account_or_404(payload.account_id)
    if selected_account:
        try:
            creds = assume_account_credentials(selected_account)
            env["AWS_ACCESS_KEY_ID"] = creds["aws_access_key_id"]
            env["AWS_SECRET_ACCESS_KEY"] = creds["aws_secret_access_key"]
            env["AWS_SESSION_TOKEN"] = creds["aws_session_token"]
            env["AWS_DEFAULT_REGION"] = selected_account.get("region") or region
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Assume role failed for selected account: {str(e)}")

    p = subprocess.run(
        [PYTHON_EXE, str(SCANNER_PATH)],
        capture_output=True,
        text=True,
        env=env,
    )

    if p.returncode != 0:
        raise HTTPException(status_code=500, detail=p.stderr or p.stdout)

    try:
        data = json.loads(p.stdout)
    except Exception:
        raise HTTPException(status_code=500, detail=f"Invalid scanner output: {p.stdout}")

    scan_id = data.get("scan_id", "")
    if scan_id and selected_account:
        save_scan_account_link(scan_id, selected_account)

    return {
        "scan_id": scan_id,
        "count": int(data.get("count", 0)),
        "account": get_scan_account_link(scan_id) if scan_id else None,
    }

@app.get("/scans/{scan_id}")
def read_scan(
    scan_id: str,
    session_cookie: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
    authorization: Optional[str] = Header(default=None),
):
    get_current_user(session_cookie, authorization)

    s = get_scan(scan_id)
    if not s:
        raise HTTPException(status_code=404, detail="scan not found")
    return enrich_scan(dict(s))


@app.get("/scans/{scan_id}/findings")
def read_findings(
    scan_id: str,
    session_cookie: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
    authorization: Optional[str] = Header(default=None),
):
    get_current_user(session_cookie, authorization)

    s = get_scan(scan_id)
    if not s:
        raise HTTPException(status_code=404, detail="scan not found")

    account = get_scan_account_link(scan_id)
    findings = get_findings(scan_id)

    enriched_findings: List[Dict[str, Any]] = []
    for item in findings:
        row = dict(item)
        row["account_id"] = account.get("account_id") if account else None
        row["customer_name"] = account.get("customer_name") if account else None
        row["account_name"] = account.get("account_name") if account else None
        row["aws_account_id"] = account.get("aws_account_id") if account else None
        row["region"] = account.get("region") if account else None
        enriched_findings.append(row)

    return {
        "scan_id": scan_id,
        "account": account,
        "findings": enriched_findings,
    }


@app.get("/scans")
def scans_list_endpoint(
    account_id: Optional[int] = Query(default=None),
    session_cookie: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
    authorization: Optional[str] = Header(default=None),
):
    get_current_user(session_cookie, authorization)

    rows = list_scans(50, account_id=account_id)
    normalized = [dict(r) for r in rows]
    return {"scans": enrich_scans(normalized)}


@app.get("/finding-actions/{scan_id}")
def get_actions_for_scan(
    scan_id: str,
    session_cookie: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
    authorization: Optional[str] = Header(default=None),
):
    get_current_user(session_cookie, authorization)
    return {"scan_id": scan_id, "actions": get_actions(scan_id)}


@app.post("/finding-actions/{scan_id}/{check_id}")
def set_action(
    scan_id: str,
    check_id: str,
    resource_id: str,
    payload: ActionIn,
    session_cookie: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
    authorization: Optional[str] = Header(default=None),
):
    get_current_user(session_cookie, authorization)

    resolution = payload.action.upper()
    if resolution not in ("FIXED", "IGNORED"):
        raise HTTPException(status_code=400, detail="action must be FIXED or IGNORED")

    note = sanitize_note(payload.note)
    if len(resource_id or "") > 500:
        raise HTTPException(status_code=400, detail="resource_id is too long")

    upsert_action(scan_id, check_id, resource_id, resolution, note)
    return {"status": "ok"}


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


@app.get("/scans/{scan_id}/export.json")
def export_scan_json(
    scan_id: str,
    session_cookie: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
    authorization: Optional[str] = Header(default=None),
):
    user = get_current_user(session_cookie, authorization)
    require_export_access(user)

    s = get_scan(scan_id)
    if not s:
        raise HTTPException(status_code=404, detail="scan not found")

    rows = _export_rows(scan_id)
    return JSONResponse(
        {
            "scan": enrich_scan(dict(s)),
            "rows": rows,
            "account": get_scan_account_link(scan_id),
        }
    )


@app.get("/scans/{scan_id}/export.csv")
def export_scan_csv(
    scan_id: str,
    session_cookie: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
    authorization: Optional[str] = Header(default=None),
):
    user = get_current_user(session_cookie, authorization)
    require_export_access(user)

    s = get_scan(scan_id)
    if not s:
        raise HTTPException(status_code=404, detail="scan not found")

    rows = _export_rows(scan_id)
    output = io.StringIO()

    fieldnames = list(rows[0].keys()) if rows else [
        "scan_id",
        "account_id",
        "customer_name",
        "account_name",
        "aws_account_id",
        "region",
        "service",
        "severity",
        "check_id",
        "resource_id",
        "status",
        "resolution",
        "note",
        "title",
        "created_at",
        "evidence",
    ]

    writer = csv.DictWriter(output, fieldnames=fieldnames)
    writer.writeheader()
    for r in rows:
        writer.writerow(r)

    output.seek(0)
    filename = f"scan_{scan_id}.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.post("/accounts")
def create_account(
    payload: ConnectedAccountIn,
    session_cookie: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
    authorization: Optional[str] = Header(default=None),
):
    user = get_current_user(session_cookie, authorization)

    limit = get_account_limit_for_user(user)
    current_count = count_connected_accounts()
    if current_count >= limit:
        raise HTTPException(
            status_code=403,
            detail=f"Your current plan allows up to {limit} connected account(s). Upgrade to add more accounts.",
        )

    customer_name = sanitize_text(payload.customer_name, "customer_name", max_len=120)
    account_name = sanitize_text(payload.account_name, "account_name", max_len=120)
    aws_account_id = sanitize_aws_account_id(payload.aws_account_id)
    role_arn = sanitize_role_arn(payload.role_arn)
    external_id = sanitize_external_id(payload.external_id)
    region = sanitize_region(payload.region)

    account_id = create_connected_account(
        customer_name=customer_name,
        account_name=account_name,
        aws_account_id=aws_account_id,
        role_arn=role_arn,
        external_id=external_id,
        region=region,
        status="PENDING",
        is_active=payload.is_active,
    )
    row = get_connected_account(account_id)
    return {"status": "ok", "account": normalize_account_row(row)}


@app.get("/accounts")
def get_accounts(
    session_cookie: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
    authorization: Optional[str] = Header(default=None),
):
    get_current_user(session_cookie, authorization)
    accounts = [normalize_account_row(r) for r in list_connected_accounts()]
    return {"accounts": accounts}


@app.get("/accounts/{account_id}")
def get_account(
    account_id: int,
    session_cookie: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
    authorization: Optional[str] = Header(default=None),
):
    get_current_user(session_cookie, authorization)

    row = get_connected_account(account_id)
    if not row:
        raise HTTPException(status_code=404, detail="account not found")
    return {"account": normalize_account_row(row)}


@app.put("/accounts/{account_id}")
def update_account(
    account_id: int,
    payload: ConnectedAccountUpdateIn,
    session_cookie: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
    authorization: Optional[str] = Header(default=None),
):
    get_current_user(session_cookie, authorization)

    customer_name = sanitize_text(payload.customer_name, "customer_name", max_len=120)
    account_name = sanitize_text(payload.account_name, "account_name", max_len=120)
    aws_account_id = sanitize_aws_account_id(payload.aws_account_id)
    role_arn = sanitize_role_arn(payload.role_arn)
    external_id = sanitize_external_id(payload.external_id)
    region = sanitize_region(payload.region)
    status = sanitize_text(payload.status, "status", max_len=40)

    ok = update_connected_account(
        account_id=account_id,
        customer_name=customer_name,
        account_name=account_name,
        aws_account_id=aws_account_id,
        role_arn=role_arn,
        external_id=external_id,
        region=region,
        status=status,
        is_active=payload.is_active,
    )
    if not ok:
        raise HTTPException(status_code=404, detail="account not found")

    row = get_connected_account(account_id)
    return {"status": "ok", "account": normalize_account_row(row)}


@app.delete("/accounts/{account_id}")
def delete_account(
    account_id: int,
    session_cookie: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
    authorization: Optional[str] = Header(default=None),
):
    get_current_user(session_cookie, authorization)

    try:
        ok = delete_connected_account(account_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    if not ok:
        raise HTTPException(status_code=404, detail="account not found")

    return {"status": "ok", "deleted": True, "account_id": account_id}


@app.post("/accounts/test-connection/{account_id}")
def test_connection(
    account_id: int,
    session_cookie: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
    authorization: Optional[str] = Header(default=None),
):
    get_current_user(session_cookie, authorization)

    row = get_connected_account(account_id)
    if not row:
        raise HTTPException(status_code=404, detail="account not found")

    account = normalize_account_row(row)
    if not account:
        raise HTTPException(status_code=404, detail="account not found")

    try:
        creds = assume_account_credentials(account)
        assumed_sts = boto3.client(
            "sts",
            aws_access_key_id=creds["aws_access_key_id"],
            aws_secret_access_key=creds["aws_secret_access_key"],
            aws_session_token=creds["aws_session_token"],
            region_name=account.get("region") or "us-east-1",
        )
        ident = assumed_sts.get_caller_identity()
        update_connected_account_status(account_id, "ACTIVE")

        refreshed = get_connected_account(account_id)

        return {
            "status": "ok",
            "message": "Connection successful",
            "account_id": account_id,
            "assumed_account": ident.get("Account"),
            "arn": ident.get("Arn"),
            "region": account.get("region"),
            "customer_name": account.get("customer_name"),
            "account_name": account.get("account_name"),
            "account": normalize_account_row(refreshed),
        }
    except Exception as e:
        update_connected_account_status(account_id, "ERROR")
        raise HTTPException(status_code=400, detail=f"Connection test failed: {str(e)}")