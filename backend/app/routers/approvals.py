"""
Approvals router — /scans/{scan_id}/approvals/* endpoints.
Implements the approval gate workflow with an immutable audit log.
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Body, Cookie, Header, HTTPException, Query
from pydantic import BaseModel

from app.config import SESSION_COOKIE_NAME
from app.deps import (
    create_approval_event,
    get_approval_events,
    get_current_user,
    get_findings,
    require_scan_owner,
    sanitize_note,
    send_fix_request_email,
)

router = APIRouter()

VALID_EVENT_TYPES = {"FIX_REQUESTED", "APPROVED", "REJECTED"}


class ApprovalIn(BaseModel):
    note: str = ""
    assignee_email: str = ""


def _validate_finding_key(check_id: str, resource_id: str) -> None:
    if len(check_id) > 200:
        raise HTTPException(status_code=400, detail="check_id too long")
    if len(resource_id) > 500:
        raise HTTPException(status_code=400, detail="resource_id too long")


@router.post("/scans/{scan_id}/approvals/request-fix")
def request_fix(
    scan_id: str,
    check_id: str = Query(...),
    resource_id: str = Query(...),
    payload: ApprovalIn = Body(default_factory=ApprovalIn),
    session_cookie: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
    authorization: Optional[str] = Header(default=None),
):
    user = get_current_user(session_cookie, authorization)
    require_scan_owner(scan_id, user["id"])
    _validate_finding_key(check_id, resource_id)

    note = sanitize_note(payload.note)
    assignee_email = (payload.assignee_email or "").strip()[:200]

    event_id = create_approval_event(
        scan_id=scan_id,
        check_id=check_id,
        resource_id=resource_id,
        event_type="FIX_REQUESTED",
        actor_user_id=user["id"],
        actor_email=user.get("email", ""),
        actor_name=user.get("name", ""),
        assignee_email=assignee_email,
        note=note,
    )

    if assignee_email:
        findings = get_findings(scan_id)
        finding = next(
            (f for f in findings if f["check_id"] == check_id and f["resource_id"] == resource_id),
            None,
        )
        send_fix_request_email(
            assignee_email=assignee_email,
            actor_name=user.get("name", ""),
            scan_id=scan_id,
            check_id=check_id,
            resource_id=resource_id,
            title=finding["title"] if finding else check_id,
            note=note,
        )

    return {"status": "ok", "event_type": "FIX_REQUESTED", "event_id": event_id}


@router.post("/scans/{scan_id}/approvals/approve")
def approve_fix(
    scan_id: str,
    check_id: str = Query(...),
    resource_id: str = Query(...),
    payload: ApprovalIn = Body(default_factory=ApprovalIn),
    session_cookie: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
    authorization: Optional[str] = Header(default=None),
):
    user = get_current_user(session_cookie, authorization)
    require_scan_owner(scan_id, user["id"])
    _validate_finding_key(check_id, resource_id)

    event_id = create_approval_event(
        scan_id=scan_id,
        check_id=check_id,
        resource_id=resource_id,
        event_type="APPROVED",
        actor_user_id=user["id"],
        actor_email=user.get("email", ""),
        actor_name=user.get("name", ""),
        note=sanitize_note(payload.note),
    )
    return {"status": "ok", "event_type": "APPROVED", "event_id": event_id}


@router.post("/scans/{scan_id}/approvals/reject")
def reject_fix(
    scan_id: str,
    check_id: str = Query(...),
    resource_id: str = Query(...),
    payload: ApprovalIn = Body(default_factory=ApprovalIn),
    session_cookie: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
    authorization: Optional[str] = Header(default=None),
):
    user = get_current_user(session_cookie, authorization)
    require_scan_owner(scan_id, user["id"])
    _validate_finding_key(check_id, resource_id)

    event_id = create_approval_event(
        scan_id=scan_id,
        check_id=check_id,
        resource_id=resource_id,
        event_type="REJECTED",
        actor_user_id=user["id"],
        actor_email=user.get("email", ""),
        actor_name=user.get("name", ""),
        note=sanitize_note(payload.note),
    )
    return {"status": "ok", "event_type": "REJECTED", "event_id": event_id}


@router.get("/scans/{scan_id}/approvals")
def get_scan_approvals(
    scan_id: str,
    check_id: Optional[str] = Query(default=None),
    resource_id: Optional[str] = Query(default=None),
    session_cookie: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
    authorization: Optional[str] = Header(default=None),
):
    user = get_current_user(session_cookie, authorization)
    require_scan_owner(scan_id, user["id"])
    events = get_approval_events(scan_id, check_id=check_id, resource_id=resource_id)
    return {"scan_id": scan_id, "events": events}
