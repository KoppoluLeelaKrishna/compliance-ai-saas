"""
Developer router — /developer/* endpoints.
API key management for programmatic access to VigiliCloud.
"""
from __future__ import annotations

import hashlib
import secrets
from typing import Optional

from fastapi import APIRouter, Cookie, Header, HTTPException
from pydantic import BaseModel

from app.config import SESSION_COOKIE_NAME
from app.deps import get_conn, get_current_user, now_utc_iso

router = APIRouter()


class ApiKeyIn(BaseModel):
    label: str


def _hash_key(key: str) -> str:
    return hashlib.sha256(key.encode()).hexdigest()


@router.get("/developer/api-keys")
def list_api_keys(
    session_cookie: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
    authorization: Optional[str] = Header(default=None),
):
    user = get_current_user(session_cookie, authorization)
    conn = get_conn()
    rows = conn.execute(
        """SELECT id, key_prefix, label, created_at, last_used_at, is_active
           FROM api_keys WHERE user_id = ? ORDER BY created_at DESC""",
        (user["id"],),
    ).fetchall()
    conn.close()
    return {"keys": [dict(r) for r in rows]}


@router.post("/developer/api-keys")
def create_api_key(
    payload: ApiKeyIn,
    session_cookie: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
    authorization: Optional[str] = Header(default=None),
):
    user = get_current_user(session_cookie, authorization)
    label = payload.label.strip()[:60]
    if not label:
        raise HTTPException(status_code=400, detail="Label is required")

    conn = get_conn()
    active_count = conn.execute(
        "SELECT COUNT(*) FROM api_keys WHERE user_id = ? AND is_active = 1",
        (user["id"],),
    ).fetchone()[0]
    if active_count >= 10:
        conn.close()
        raise HTTPException(status_code=400, detail="Maximum 10 active API keys allowed")

    raw_key = "vc_" + secrets.token_urlsafe(32)
    key_hash = _hash_key(raw_key)
    key_prefix = raw_key[:14] + "..."
    created_at = now_utc_iso()

    conn.execute(
        """INSERT INTO api_keys (user_id, key_hash, key_prefix, label, created_at, last_used_at, is_active)
           VALUES (?, ?, ?, ?, ?, '', 1)""",
        (user["id"], key_hash, key_prefix, label, created_at),
    )
    conn.commit()
    key_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.close()

    return {
        "id": key_id,
        "key": raw_key,
        "key_prefix": key_prefix,
        "label": label,
        "created_at": created_at,
    }


@router.delete("/developer/api-keys/{key_id}")
def revoke_api_key(
    key_id: int,
    session_cookie: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
    authorization: Optional[str] = Header(default=None),
):
    user = get_current_user(session_cookie, authorization)
    conn = get_conn()
    conn.execute(
        "UPDATE api_keys SET is_active = 0 WHERE id = ? AND user_id = ?",
        (key_id, user["id"]),
    )
    conn.commit()
    conn.close()
    return {"ok": True}
