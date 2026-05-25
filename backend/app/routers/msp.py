"""
MSP Multi-Tenant router — client grouping, aggregate dashboards, bulk scans.
"""
from __future__ import annotations

import threading
from typing import Optional

from fastapi import APIRouter, Cookie, Header, HTTPException
from pydantic import BaseModel

from app.config import SESSION_COOKIE_NAME
from app.deps import (
    get_conn,
    get_current_user,
    get_findings,
    list_connected_accounts,
    normalize_account_row,
    run_account_scan,
)

router = APIRouter(prefix="/msp", tags=["msp"])


class SetClientGroupIn(BaseModel):
    client_group: str


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def _get_account_findings_summary(scan_id: str) -> dict:
    """Return {total, fail, critical, high} for a scan — returns zeros on error."""
    try:
        findings = get_findings(scan_id)
        total = len(findings)
        fail = sum(1 for f in findings if f.get("status") == "FAIL")
        critical = sum(1 for f in findings if f.get("severity") == "CRITICAL" and f.get("status") == "FAIL")
        high = sum(1 for f in findings if f.get("severity") == "HIGH" and f.get("status") == "FAIL")
        return {"total": total, "fail": fail, "critical": critical, "high": high}
    except Exception:
        return {"total": 0, "fail": 0, "critical": 0, "high": 0}


def _latest_scan_for_account(account_id: int) -> Optional[dict]:
    conn = get_conn()
    try:
        row = conn.execute(
            """
            SELECT s.scan_id, s.status, s.created_at
            FROM scans s
            JOIN scan_account_links sal ON s.scan_id = sal.scan_id
            WHERE sal.account_id = ?
            ORDER BY s.created_at DESC
            LIMIT 1
            """,
            (account_id,),
        ).fetchone()
    finally:
        conn.close()
    if not row:
        return None
    return {"scan_id": row["scan_id"], "status": row["status"], "created_at": row["created_at"]}


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/clients")
def list_clients(
    session_cookie: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
    authorization: Optional[str] = Header(default=None),
):
    """Return all accounts grouped by client_group with aggregate risk data."""
    user = get_current_user(session_cookie, authorization)

    conn = get_conn()
    try:
        rows = conn.execute(
            """
            SELECT id, customer_name, account_name, aws_account_id,
                   role_arn, external_id, region, status, is_active,
                   created_at, updated_at,
                   COALESCE(client_group, '') AS client_group
            FROM connected_accounts
            WHERE user_id = ?
            ORDER BY client_group, customer_name
            """,
            (user["id"],),
        ).fetchall()
    finally:
        conn.close()

    # Group accounts by client_group
    groups: dict[str, dict] = {}
    ungrouped = []

    for row in rows:
        acct = dict(row)
        acct["is_active"] = bool(acct.get("is_active", 1))

        latest = _latest_scan_for_account(acct["id"])
        if latest:
            summary = _get_account_findings_summary(latest["scan_id"])
            acct["latest_scan"] = {**latest, **summary}
        else:
            acct["latest_scan"] = None

        group_name = acct.get("client_group", "").strip()
        if not group_name:
            ungrouped.append(acct)
            continue

        if group_name not in groups:
            groups[group_name] = {
                "client_group": group_name,
                "accounts": [],
                "total_accounts": 0,
                "critical": 0,
                "high": 0,
                "last_scan_at": None,
            }
        g = groups[group_name]
        g["accounts"].append(acct)
        g["total_accounts"] += 1
        if acct["latest_scan"]:
            g["critical"] += acct["latest_scan"]["critical"]
            g["high"] += acct["latest_scan"]["high"]
            scan_at = acct["latest_scan"]["created_at"]
            if not g["last_scan_at"] or scan_at > g["last_scan_at"]:
                g["last_scan_at"] = scan_at

    return {
        "clients": list(groups.values()),
        "ungrouped": ungrouped,
    }


@router.put("/accounts/{account_id}/client-group")
def set_client_group(
    account_id: int,
    payload: SetClientGroupIn,
    session_cookie: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
    authorization: Optional[str] = Header(default=None),
):
    """Assign or clear the client_group for an account."""
    user = get_current_user(session_cookie, authorization)
    group = payload.client_group.strip()

    conn = get_conn()
    try:
        row = conn.execute(
            "SELECT id FROM connected_accounts WHERE id = ? AND user_id = ?",
            (account_id, user["id"]),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Account not found.")

        conn.execute(
            "UPDATE connected_accounts SET client_group = ? WHERE id = ?",
            (group, account_id),
        )
        conn.commit()
    finally:
        conn.close()

    return {"ok": True, "account_id": account_id, "client_group": group}


@router.post("/clients/{client_group}/scan")
def scan_client_group(
    client_group: str,
    session_cookie: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
    authorization: Optional[str] = Header(default=None),
):
    """Trigger a fresh scan for every account in a client group."""
    user = get_current_user(session_cookie, authorization)

    conn = get_conn()
    try:
        rows = conn.execute(
            """
            SELECT id, customer_name, account_name, aws_account_id,
                   role_arn, external_id, region, status, is_active, client_group
            FROM connected_accounts
            WHERE user_id = ? AND COALESCE(client_group, '') = ?
            """,
            (user["id"], client_group.strip()),
        ).fetchall()
    finally:
        conn.close()

    if not rows:
        raise HTTPException(status_code=404, detail=f"No accounts found in client group '{client_group}'.")

    accounts = [normalize_account_row(dict(r)) for r in rows]
    accounts = [a for a in accounts if a and a.get("role_arn")]

    if not accounts:
        raise HTTPException(status_code=400, detail="No accounts with a configured IAM role in this group.")

    def _run_all():
        for acct in accounts:
            try:
                run_account_scan(acct, dict(user))
            except Exception:
                pass

    threading.Thread(target=_run_all, daemon=True).start()
    return {
        "ok": True,
        "message": f"Scans started for {len(accounts)} account(s) in '{client_group}'. Check the Scans page shortly.",
        "accounts_triggered": len(accounts),
    }
