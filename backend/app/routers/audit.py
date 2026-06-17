"""
Audit portal router — shareable read-only compliance report links.
POST /scans/{scan_id}/share  → generates a token, returns a public URL
GET  /audit/{token}          → public endpoint, no auth required, returns sanitised report
"""
from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Cookie, Header, HTTPException

from app.config import FRONTEND_URL, SESSION_COOKIE_NAME
from app.deps import (
    get_conn,
    get_current_user,
    get_findings,
    get_scan,
    now_utc_iso,
    require_scan_owner,
)
from app.routers.compliance import COMPLIANCE_CONTROLS

router = APIRouter()

_REPORT_TTL_DAYS = 30


def _ensure_audit_reports_table() -> None:
    conn = get_conn()
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS audit_reports (
            token TEXT PRIMARY KEY,
            scan_id TEXT NOT NULL,
            user_id INTEGER NOT NULL,
            created_at TEXT NOT NULL,
            expires_at TEXT NOT NULL
        )
        """
    )
    conn.commit()
    conn.close()


def _compute_risk_score(findings: List[Dict[str, Any]]) -> Dict[str, Any]:
    weights = {"CRITICAL": 10, "HIGH": 5, "MEDIUM": 3, "LOW": 1}
    open_fails = [
        f for f in findings
        if f.get("status") == "FAIL" and f.get("resolution", "OPEN") == "OPEN"
    ]
    total_checks = len(findings)
    if total_checks == 0:
        return {"score": 100, "grade": "A", "breakdown": {}}

    raw_penalty = sum(weights.get(f.get("severity", "LOW"), 1) for f in open_fails)
    max_penalty = total_checks * weights["CRITICAL"]
    score = max(0, round(100 - (raw_penalty / max_penalty * 100))) if max_penalty else 100

    breakdown = {"CRITICAL": 0, "HIGH": 0, "MEDIUM": 0, "LOW": 0}
    for f in open_fails:
        sev = f.get("severity", "LOW")
        if sev in breakdown:
            breakdown[sev] += 1

    grade = "A" if score >= 90 else "B" if score >= 75 else "C" if score >= 60 else "D" if score >= 40 else "F"
    return {"score": score, "grade": grade, "breakdown": breakdown}


@router.post("/scans/{scan_id}/share")
def share_scan(
    scan_id: str,
    session_cookie: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
    authorization: Optional[str] = Header(default=None),
):
    user = get_current_user(session_cookie, authorization)
    require_scan_owner(scan_id, user["id"])
    _ensure_audit_reports_table()

    token = secrets.token_urlsafe(32)
    expires_at = (datetime.now(timezone.utc) + timedelta(days=_REPORT_TTL_DAYS)).isoformat()

    conn = get_conn()
    conn.execute(
        "INSERT INTO audit_reports (token, scan_id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?)",
        (token, scan_id, user["id"], now_utc_iso(), expires_at),
    )
    conn.commit()
    conn.close()

    public_url = f"{FRONTEND_URL}/audit/{token}"
    return {
        "ok": True,
        "token": token,
        "url": public_url,
        "expires_at": expires_at,
        "expires_in_days": _REPORT_TTL_DAYS,
    }


@router.get("/audit/{token}")
def public_audit_report(token: str):
    """Public endpoint — no auth required. Returns a sanitised compliance summary."""
    _ensure_audit_reports_table()

    conn = get_conn()
    row = conn.execute(
        "SELECT scan_id, user_id, created_at, expires_at FROM audit_reports WHERE token = ?",
        (token,),
    ).fetchone()
    conn.close()

    if not row:
        raise HTTPException(status_code=404, detail="Report not found or link has expired")

    expires_at = row["expires_at"]
    try:
        if datetime.fromisoformat(expires_at) <= datetime.now(timezone.utc):
            raise HTTPException(status_code=410, detail="This report link has expired")
    except ValueError:
        pass

    scan_id = row["scan_id"]
    scan = get_scan(scan_id)
    if not scan:
        raise HTTPException(status_code=404, detail="Scan data not found")

    findings = get_findings(scan_id)
    risk = _compute_risk_score(findings)

    # Per-framework coverage
    fail_checks = {
        f["check_id"].upper()
        for f in findings
        if f.get("status") == "FAIL" and f.get("resolution", "OPEN") == "OPEN"
    }
    frameworks = {"soc2": "SOC 2", "iso27001": "ISO 27001", "pci_dss": "PCI DSS", "nist": "NIST SP 800-53"}
    framework_coverage: Dict[str, Any] = {}
    for fw_key, fw_name in frameworks.items():
        controls: Dict[str, str] = {}
        for check_id, mapping in COMPLIANCE_CONTROLS.items():
            for ctrl in mapping.get(fw_key, []):
                if ctrl not in controls:
                    controls[ctrl] = "PASS"
                if check_id in fail_checks:
                    controls[ctrl] = "FAIL"
        total = len(controls)
        passing = sum(1 for v in controls.values() if v == "PASS")
        framework_coverage[fw_key] = {
            "name": fw_name,
            "total": total,
            "passing": passing,
            "pct": round(passing / total * 100) if total else 100,
        }

    # Sanitised findings — no internal IDs, just compliance-relevant info
    public_findings = [
        {
            "service": f.get("service"),
            "severity": f.get("severity"),
            "check_id": f.get("check_id"),
            "title": f.get("title"),
            "status": f.get("status"),
            "resolution": f.get("resolution", "OPEN"),
            "controls": {
                fw: COMPLIANCE_CONTROLS.get(str(f.get("check_id", "")).upper(), {}).get(fw, [])
                for fw in ["soc2", "iso27001", "pci_dss", "nist"]
            },
        }
        for f in findings
    ]

    severity_counts: Dict[str, int] = {"CRITICAL": 0, "HIGH": 0, "MEDIUM": 0, "LOW": 0}
    for f in findings:
        if f.get("status") == "FAIL":
            sev = f.get("severity", "LOW")
            if sev in severity_counts:
                severity_counts[sev] += 1

    return {
        "scan_id": scan_id,
        "scan_date": scan.get("created_at"),
        "report_generated_at": now_utc_iso(),
        "expires_at": expires_at,
        "risk": risk,
        "severity_breakdown": severity_counts,
        "total_findings": len(findings),
        "open_findings": len([f for f in findings if f.get("status") == "FAIL" and f.get("resolution", "OPEN") == "OPEN"]),
        "framework_coverage": framework_coverage,
        "findings": public_findings,
        "powered_by": "VigiliCloud AWS Security Posture Management",
    }


@router.get("/scans/{scan_id}/shares")
def list_scan_shares(
    scan_id: str,
    session_cookie: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
    authorization: Optional[str] = Header(default=None),
):
    user = get_current_user(session_cookie, authorization)
    require_scan_owner(scan_id, user["id"])
    _ensure_audit_reports_table()

    conn = get_conn()
    rows = conn.execute(
        "SELECT token, created_at, expires_at FROM audit_reports WHERE scan_id = ? ORDER BY created_at DESC",
        (scan_id,),
    ).fetchall()
    conn.close()

    return {
        "scan_id": scan_id,
        "shares": [
            {
                "token": r["token"],
                "url": f"{FRONTEND_URL}/audit/{r['token']}",
                "created_at": r["created_at"],
                "expires_at": r["expires_at"],
            }
            for r in rows
        ],
    }
