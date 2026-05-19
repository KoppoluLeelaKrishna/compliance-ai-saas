"""
Fix-guidance router — /fix-guidance/* endpoints.
"""
from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import APIRouter, Body, Cookie, Header, HTTPException

from app.config import SESSION_COOKIE_NAME
from app.deps import (
    FixGuidanceIn,
    FixGuidanceOut,
    _do_seed_fix_guidance,
    get_current_user,
    get_fix_guidance,
    sanitize_text,
    upsert_fix_guidance,
)

router = APIRouter()


@router.get("/fix-guidance/{check_id}", response_model=FixGuidanceOut)
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


@router.post("/fix-guidance/seed")
def seed_fix_guidance(
    payload: Optional[Dict[str, Any]] = Body(default=None),
    session_cookie: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
    authorization: Optional[str] = Header(default=None),
):
    get_current_user(session_cookie, authorization)
    _do_seed_fix_guidance()
    return {"status": "ok"}


@router.post("/fix-guidance/{check_id}", response_model=FixGuidanceOut)
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
