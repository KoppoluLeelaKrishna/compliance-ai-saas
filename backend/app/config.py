"""
Centralised configuration for VigiliCloud API.
All env-var reads and derived constants live here so that
deps.py and routers can import without touching main.py.
"""
from __future__ import annotations

import os
import re
import sys
from pathlib import Path
from typing import List

from dotenv import load_dotenv

load_dotenv()

# ---------------------------------------------------------------------------
# Project-root / path resolution
# ---------------------------------------------------------------------------
_root_candidates = [
    Path(__file__).resolve().parents[2],
    Path(__file__).resolve().parents[1],
]
PROJECT_ROOT: Path = next(
    (r for r in _root_candidates if (r / "worker" / "src" / "runner.py").exists()),
    _root_candidates[0],
)
SCANNER_PATH: Path = PROJECT_ROOT / "worker" / "src" / "runner.py"
PYTHON_EXE: str = sys.executable

if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

# ---------------------------------------------------------------------------
# Runtime environment
# ---------------------------------------------------------------------------
APP_ENV: str = os.getenv("APP_ENV", "local").strip().lower()
DATABASE_URL: str = os.getenv("DATABASE_URL", "").strip()
USE_POSTGRES: bool = APP_ENV == "production" and bool(DATABASE_URL)
IS_PRODUCTION: bool = APP_ENV == "production"

# ---------------------------------------------------------------------------
# Helpers used at config-level only
# ---------------------------------------------------------------------------

def env_bool(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def build_cors_origins() -> List[str]:
    origins: List[str] = [
        "https://app.vigilicloud.com",
        "https://vigilicloud-ui.onrender.com",
    ]
    frontend_url = os.getenv("FRONTEND_URL", "").strip().rstrip("/")
    if frontend_url:
        origins.append(frontend_url)
    extra = os.getenv("CORS_ORIGINS", "").strip()
    if extra:
        origins.extend([item.strip().rstrip("/") for item in extra.split(",") if item.strip()])
    origins.extend(["http://localhost:3000", "http://127.0.0.1:3000"])
    deduped: List[str] = []
    seen: set = set()
    for item in origins:
        if item and item not in seen:
            deduped.append(item)
            seen.add(item)
    return deduped


# ---------------------------------------------------------------------------
# Auth / session
# ---------------------------------------------------------------------------
SESSION_COOKIE_NAME: str = "compliance_session"
SESSION_TTL_HOURS: int = 12
COOKIE_SECURE: bool = env_bool("COOKIE_SECURE", IS_PRODUCTION)
COOKIE_SAMESITE: str = "none" if COOKIE_SECURE else "lax"

DEFAULT_ADMIN_EMAIL: str = "admin@compliance.local"
DEFAULT_ADMIN_PASSWORD: str = "admin123"
DEFAULT_ADMIN_NAME: str = "Admin User"

# ---------------------------------------------------------------------------
# Frontend / CORS
# ---------------------------------------------------------------------------
FRONTEND_URL: str = os.getenv("FRONTEND_URL", "http://localhost:3000").strip().rstrip("/")
CORS_ORIGINS: List[str] = build_cors_origins()

# ---------------------------------------------------------------------------
# Razorpay
# ---------------------------------------------------------------------------
RAZORPAY_KEY_ID: str = os.getenv("RAZORPAY_KEY_ID", "").strip()
RAZORPAY_KEY_SECRET: str = os.getenv("RAZORPAY_KEY_SECRET", "").strip()
RAZORPAY_WEBHOOK_SECRET: str = os.getenv("RAZORPAY_WEBHOOK_SECRET", "").strip()

RAZORPAY_PLAN_STARTER: str = os.getenv("RAZORPAY_PLAN_STARTER", "").strip()
RAZORPAY_PLAN_PRO: str = os.getenv("RAZORPAY_PLAN_PRO", "").strip()
RAZORPAY_PLAN_MSP: str = os.getenv("RAZORPAY_PLAN_MSP", "").strip()

RAZORPAY_PLAN_IDS: dict = {
    "starter": RAZORPAY_PLAN_STARTER,
    "pro": RAZORPAY_PLAN_PRO,
    "msp": RAZORPAY_PLAN_MSP,
}

# ---------------------------------------------------------------------------
# GitHub OAuth
# ---------------------------------------------------------------------------
GITHUB_CLIENT_ID: str = os.getenv("GITHUB_CLIENT_ID", "").strip()
GITHUB_CLIENT_SECRET: str = os.getenv("GITHUB_CLIENT_SECRET", "").strip()
GITHUB_CALLBACK_URL: str = os.getenv(
    "GITHUB_CALLBACK_URL",
    "http://localhost:8000/auth/github/callback",
).strip()

# ---------------------------------------------------------------------------
# Email
# ---------------------------------------------------------------------------
RESEND_API_KEY: str = os.getenv("RESEND_API_KEY", "").strip()
FROM_EMAIL: str = os.getenv("FROM_EMAIL", "alerts@vigilicloud.com").strip()

# ---------------------------------------------------------------------------
# Plan limits
# ---------------------------------------------------------------------------
PLAN_ACCOUNT_LIMITS: dict = {
    "free": 1,
    "starter": 3,
    "pilot": 2,
    "pro": 10,
    "msp": 999999,
}

# ---------------------------------------------------------------------------
# Rate-limit tuples  (limit, window_seconds)
# ---------------------------------------------------------------------------
LOGIN_RATE_LIMIT: tuple = (10, 300)
SCAN_RATE_LIMIT: tuple = (20, 300)
BILLING_RATE_LIMIT: tuple = (30, 300)
WEBHOOK_RATE_LIMIT: tuple = (120, 300)

# ---------------------------------------------------------------------------
# Scheduler
# ---------------------------------------------------------------------------
SCAN_SCHEDULE_HOURS: int = int(os.getenv("SCAN_SCHEDULE_HOURS", "24"))

# ---------------------------------------------------------------------------
# Regex patterns (shared across validators)
# ---------------------------------------------------------------------------
AWS_REGION_RE = re.compile(r"^[a-z]{2}-[a-z]+-\d+$")
AWS_ACCOUNT_ID_RE = re.compile(r"^\d{12}$")
ROLE_ARN_RE = re.compile(r"^arn:aws:iam::\d{12}:role\/[A-Za-z0-9+=,.@_\-/]+$")
BUCKET_NAME_RE = re.compile(r"^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$")
