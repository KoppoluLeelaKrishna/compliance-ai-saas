"""
Org notes router — /org-notes/* endpoints.
Allows admins/users to attach organisation-level remediation notes to any check_id.
These notes are shown alongside fix guidance for all team members.
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Cookie, Header, HTTPException
from pydantic import BaseModel

from app.config import SESSION_COOKIE_NAME
from app.deps import get_conn, get_current_user, now_utc_iso, require_non_viewer, sanitize_note

router = APIRouter(prefix="/org-notes")


class OrgNoteIn(BaseModel):
    note: str


def _ensure_table() -> None:
    conn = get_conn()
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS org_notes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            check_id TEXT NOT NULL,
            note TEXT NOT NULL DEFAULT '',
            updated_at TEXT NOT NULL,
            UNIQUE(user_id, check_id)
        )
        """
    )
    conn.commit()
    conn.close()


@router.get("/{check_id}")
def get_org_note(
    check_id: str,
    session_cookie: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
    authorization: Optional[str] = Header(default=None),
):
    user = get_current_user(session_cookie, authorization)
    _ensure_table()
    conn = get_conn()
    row = conn.execute(
        "SELECT note, updated_at FROM org_notes WHERE user_id = ? AND check_id = ?",
        (user["id"], check_id.upper()),
    ).fetchone()
    conn.close()
    return {
        "check_id": check_id,
        "note": row["note"] if row else "",
        "updated_at": row["updated_at"] if row else None,
    }


@router.put("/{check_id}")
def upsert_org_note(
    check_id: str,
    payload: OrgNoteIn,
    session_cookie: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
    authorization: Optional[str] = Header(default=None),
):
    user = get_current_user(session_cookie, authorization)
    require_non_viewer(user)
    _ensure_table()

    note = sanitize_note(payload.note)

    conn = get_conn()
    conn.execute(
        """
        INSERT INTO org_notes (user_id, check_id, note, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(user_id, check_id)
        DO UPDATE SET note = excluded.note, updated_at = excluded.updated_at
        """,
        (user["id"], check_id.upper(), note, now_utc_iso()),
    )
    conn.commit()
    conn.close()
    return {"ok": True, "check_id": check_id, "note": note}


@router.delete("/{check_id}")
def delete_org_note(
    check_id: str,
    session_cookie: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
    authorization: Optional[str] = Header(default=None),
):
    user = get_current_user(session_cookie, authorization)
    require_non_viewer(user)
    _ensure_table()
    conn = get_conn()
    conn.execute(
        "DELETE FROM org_notes WHERE user_id = ? AND check_id = ?",
        (user["id"], check_id.upper()),
    )
    conn.commit()
    conn.close()
    return {"ok": True}


@router.get("/")
def list_org_notes(
    session_cookie: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
    authorization: Optional[str] = Header(default=None),
):
    user = get_current_user(session_cookie, authorization)
    _ensure_table()
    conn = get_conn()
    rows = conn.execute(
        "SELECT check_id, note, updated_at FROM org_notes WHERE user_id = ? ORDER BY check_id",
        (user["id"],),
    ).fetchall()
    conn.close()
    return {"notes": [dict(r) for r in rows]}
