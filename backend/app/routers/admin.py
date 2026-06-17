"""
Admin router — /admin/* endpoints (admin-only user management).
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Cookie, Header, HTTPException
from pydantic import BaseModel

from app.config import SESSION_COOKIE_NAME
from app.deps import (
    get_conn,
    get_current_user,
    hash_password,
    now_utc_iso,
    require_admin,
    sanitize_email,
    sanitize_password,
    sanitize_text,
)

router = APIRouter(prefix="/admin")

ALLOWED_ROLES = {"admin", "user", "viewer"}


class UpdateRoleIn(BaseModel):
    role: str


class InviteUserIn(BaseModel):
    email: str
    name: str
    password: str
    role: str = "viewer"


@router.get("/users")
def list_users(
    session_cookie: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
    authorization: Optional[str] = Header(default=None),
):
    user = get_current_user(session_cookie, authorization)
    require_admin(user)

    conn = get_conn()
    rows = conn.execute(
        """
        SELECT id, email, name, role, subscription_status, created_at
        FROM users
        ORDER BY id ASC
        """
    ).fetchall()
    conn.close()
    return {"users": [dict(r) for r in rows]}


@router.put("/users/{user_id}/role")
def update_user_role(
    user_id: int,
    payload: UpdateRoleIn,
    session_cookie: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
    authorization: Optional[str] = Header(default=None),
):
    actor = get_current_user(session_cookie, authorization)
    require_admin(actor)

    role = payload.role.strip().lower()
    if role not in ALLOWED_ROLES:
        raise HTTPException(status_code=400, detail=f"role must be one of: {', '.join(ALLOWED_ROLES)}")

    if user_id == actor["id"] and role != "admin":
        raise HTTPException(status_code=400, detail="Cannot demote your own admin account")

    conn = get_conn()
    row = conn.execute("SELECT id FROM users WHERE id = ?", (user_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="User not found")

    conn.execute("UPDATE users SET role = ? WHERE id = ?", (role, user_id))
    conn.commit()
    conn.close()
    return {"ok": True, "user_id": user_id, "role": role}


@router.post("/users/invite")
def invite_user(
    payload: InviteUserIn,
    session_cookie: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
    authorization: Optional[str] = Header(default=None),
):
    actor = get_current_user(session_cookie, authorization)
    require_admin(actor)

    email = sanitize_email(payload.email)
    password = sanitize_password(payload.password)
    name = sanitize_text(payload.name, "Name", min_len=1, max_len=100)
    role = payload.role.strip().lower()
    if role not in ALLOWED_ROLES:
        raise HTTPException(status_code=400, detail=f"role must be one of: {', '.join(ALLOWED_ROLES)}")

    conn = get_conn()
    try:
        conn.execute(
            """
            INSERT INTO users (email, password_hash, name, role, created_at,
                               subscription_status, razorpay_customer_id, razorpay_subscription_id)
            VALUES (?, ?, ?, ?, ?, 'free', '', '')
            """,
            (email, hash_password(password), name, role, now_utc_iso()),
        )
        conn.commit()
        user_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    except Exception:
        conn.close()
        raise HTTPException(status_code=409, detail="An account with this email already exists")
    conn.close()
    return {"ok": True, "user_id": user_id, "email": email, "role": role}


@router.delete("/users/{user_id}")
def delete_user(
    user_id: int,
    session_cookie: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
    authorization: Optional[str] = Header(default=None),
):
    actor = get_current_user(session_cookie, authorization)
    require_admin(actor)

    if user_id == actor["id"]:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")

    conn = get_conn()
    row = conn.execute("SELECT id FROM users WHERE id = ?", (user_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="User not found")

    conn.execute("DELETE FROM auth_sessions WHERE user_id = ?", (user_id,))
    conn.execute("DELETE FROM users WHERE id = ?", (user_id,))
    conn.commit()
    conn.close()
    return {"ok": True}
