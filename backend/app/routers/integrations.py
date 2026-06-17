"""
Integrations router — Jira, GitHub Issues, and auto-verify endpoints.
"""
from __future__ import annotations

import base64
import json as _json
import os
import urllib.request as _ur
from typing import Optional

from fastapi import APIRouter, Cookie, Header, HTTPException, Query
from pydantic import BaseModel

from app.config import SESSION_COOKIE_NAME
from app.deps import (
    decrypt_secret,
    encrypt_secret,
    get_conn,
    get_current_user,
    get_findings,
    get_fix_guidance,
    list_connected_accounts,
    normalize_account_row,
    require_non_viewer,
    require_scan_owner,
    run_account_scan,
    get_scan_account_link,
)

import threading

router = APIRouter()


# ---------------------------------------------------------------------------
# Config models
# ---------------------------------------------------------------------------

class JiraConfigIn(BaseModel):
    jira_url: str = ""
    jira_email: str = ""
    jira_api_token: str = ""
    jira_project_key: str = ""


class GitHubConfigIn(BaseModel):
    github_token: str = ""
    github_default_repo: str = ""


# ---------------------------------------------------------------------------
# Integration config CRUD
# ---------------------------------------------------------------------------

@router.get("/integrations/config")
def get_integration_config(
    session_cookie: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
    authorization: Optional[str] = Header(default=None),
):
    user = get_current_user(session_cookie, authorization)
    conn = get_conn()
    try:
        row = conn.execute(
            """SELECT jira_url, jira_email, jira_project_key,
                      github_default_repo
               FROM users WHERE id = ?""",
            (user["id"],),
        ).fetchone()
    finally:
        conn.close()
    if not row:
        return {"jira": {}, "github": {}}
    return {
        "jira": {
            "jira_url": row["jira_url"] or "",
            "jira_email": row["jira_email"] or "",
            "jira_api_token_set": bool(row["jira_url"] and row["jira_email"]),
            "jira_project_key": row["jira_project_key"] or "",
        },
        "github": {
            "github_token_set": False,
            "github_default_repo": row["github_default_repo"] or "",
        },
    }


@router.put("/integrations/jira")
def save_jira_config(
    payload: JiraConfigIn,
    session_cookie: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
    authorization: Optional[str] = Header(default=None),
):
    user = get_current_user(session_cookie, authorization)
    require_non_viewer(user)
    url = payload.jira_url.strip().rstrip("/")
    if url and not url.startswith("https://"):
        raise HTTPException(status_code=400, detail="Jira URL must start with https://")
    conn = get_conn()
    conn.execute(
        """UPDATE users SET jira_url = ?, jira_email = ?,
           jira_api_token = ?, jira_project_key = ? WHERE id = ?""",
        (url, payload.jira_email.strip(),
         encrypt_secret(payload.jira_api_token.strip()),
         payload.jira_project_key.strip().upper(), user["id"]),
    )
    conn.commit()
    conn.close()
    return {"ok": True}


@router.put("/integrations/github")
def save_github_config(
    payload: GitHubConfigIn,
    session_cookie: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
    authorization: Optional[str] = Header(default=None),
):
    user = get_current_user(session_cookie, authorization)
    require_non_viewer(user)
    conn = get_conn()
    conn.execute(
        "UPDATE users SET github_token = ?, github_default_repo = ? WHERE id = ?",
        (encrypt_secret(payload.github_token.strip()), payload.github_default_repo.strip(), user["id"]),
    )
    conn.commit()
    conn.close()
    return {"ok": True}


# ---------------------------------------------------------------------------
# Jira ticket creation
# ---------------------------------------------------------------------------

def _build_ticket_body(finding: dict, guidance: dict | None) -> str:
    steps = "\n".join(f"{i+1}. {s}" for i, s in enumerate(guidance["steps"])) if guidance else ""
    cli = "\n".join(guidance["cli"]) if guidance else ""
    return (
        f"Severity: {finding.get('severity', '')}\n"
        f"Service: {finding.get('service', '')}\n"
        f"Check: {finding.get('check_id', '')}\n"
        f"Resource: {finding.get('resource_id', '')}\n\n"
        f"Summary:\n{guidance['summary'] if guidance else finding.get('title', '')}\n\n"
        f"Remediation Steps:\n{steps}\n\n"
        f"CLI Commands:\n{cli}\n\n"
        f"Detected by VigiliCloud scan {finding.get('scan_id', '')[:8]}"
    )


@router.post("/scans/{scan_id}/create-jira-ticket")
def create_jira_ticket(
    scan_id: str,
    check_id: str = Query(...),
    resource_id: str = Query(...),
    session_cookie: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
    authorization: Optional[str] = Header(default=None),
):
    user = get_current_user(session_cookie, authorization)
    require_scan_owner(scan_id, user["id"])

    conn = get_conn()
    try:
        row = conn.execute(
            "SELECT jira_url, jira_email, jira_api_token, jira_project_key FROM users WHERE id = ?",
            (user["id"],),
        ).fetchone()
    finally:
        conn.close()

    if not row or not row["jira_url"] or not row["jira_email"] or not row["jira_api_token"]:
        raise HTTPException(status_code=400, detail="Jira integration not configured. Add your Jira credentials in Settings.")

    jira_url = row["jira_url"].rstrip("/")
    project_key = row["jira_project_key"] or "SEC"
    jira_api_token = decrypt_secret(row["jira_api_token"])

    findings = get_findings(scan_id)
    finding = next((f for f in findings if f["check_id"] == check_id and f["resource_id"] == resource_id), None)
    if not finding:
        raise HTTPException(status_code=404, detail="Finding not found")

    guidance = get_fix_guidance(check_id)

    priority_map = {"CRITICAL": "Critical", "HIGH": "High", "MEDIUM": "Medium", "LOW": "Low"}
    priority = priority_map.get(finding.get("severity", "LOW"), "Medium")

    description = _build_ticket_body(dict(finding), dict(guidance) if guidance else None)
    title = f"[{finding.get('severity', 'MEDIUM')}] {finding.get('title', check_id)} — {str(resource_id)[:60]}"

    payload = {
        "fields": {
            "project": {"key": project_key},
            "summary": title[:255],
            "description": description,
            "issuetype": {"name": "Bug"},
            "priority": {"name": priority},
            "labels": ["security", "compliance", "vigilicloud"],
        }
    }

    creds = base64.b64encode(f"{row['jira_email']}:{jira_api_token}".encode()).decode()
    body = _json.dumps(payload).encode()
    req = _ur.Request(
        f"{jira_url}/rest/api/2/issue",
        data=body,
        headers={
            "Authorization": f"Basic {creds}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
    )
    try:
        with _ur.urlopen(req, timeout=15) as resp:
            result = _json.loads(resp.read().decode())
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Jira API error: {str(e)[:200]}")

    issue_key = result.get("key", "")
    issue_url = f"{jira_url}/browse/{issue_key}" if issue_key else ""
    return {"ok": True, "issue_key": issue_key, "issue_url": issue_url}


# ---------------------------------------------------------------------------
# GitHub Issue creation
# ---------------------------------------------------------------------------

@router.post("/scans/{scan_id}/create-github-issue")
def create_github_issue(
    scan_id: str,
    check_id: str = Query(...),
    resource_id: str = Query(...),
    session_cookie: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
    authorization: Optional[str] = Header(default=None),
):
    user = get_current_user(session_cookie, authorization)
    require_scan_owner(scan_id, user["id"])

    conn = get_conn()
    try:
        row = conn.execute(
            "SELECT github_token, github_default_repo FROM users WHERE id = ?",
            (user["id"],),
        ).fetchone()
    finally:
        conn.close()

    if not row or not row["github_token"] or not row["github_default_repo"]:
        raise HTTPException(status_code=400, detail="GitHub integration not configured. Add your token and repo in Settings.")

    token = decrypt_secret(row["github_token"])
    repo = row["github_default_repo"].strip("/")  # owner/repo

    findings = get_findings(scan_id)
    finding = next((f for f in findings if f["check_id"] == check_id and f["resource_id"] == resource_id), None)
    if not finding:
        raise HTTPException(status_code=404, detail="Finding not found")

    guidance = get_fix_guidance(check_id)
    steps = "\n".join(f"{i+1}. {s}" for i, s in enumerate(guidance["steps"])) if guidance else ""
    cli = "\n".join(f"```bash\n{c}\n```" for c in guidance["cli"]) if guidance else ""
    summary = guidance["summary"] if guidance else finding.get("title", "")

    body = (
        f"| Field | Value |\n|---|---|\n"
        f"| **Severity** | `{finding.get('severity', '')}` |\n"
        f"| **Service** | {finding.get('service', '')} |\n"
        f"| **Check** | `{check_id}` |\n"
        f"| **Resource** | `{str(resource_id)[:120]}` |\n"
        f"| **Scan** | `{scan_id[:8]}` |\n\n"
        f"## Summary\n{summary}\n\n"
        f"## Remediation Steps\n{steps}\n\n"
        f"## CLI Fix\n{cli}\n\n"
        f"## Acceptance Criteria\n"
        f"- [ ] Fix applied\n- [ ] Re-scan confirms finding resolved\n- [ ] Approved by security team\n\n"
        f"---\n*Generated by [VigiliCloud](https://vigilicloud.com) — AWS Security Posture Management*"
    )

    title = f"[{finding.get('severity', 'MEDIUM')}] {finding.get('title', check_id)}"

    payload = {
        "title": title[:255],
        "body": body,
        "labels": ["security", "compliance"],
    }

    req_body = _json.dumps(payload).encode()
    req = _ur.Request(
        f"https://api.github.com/repos/{repo}/issues",
        data=req_body,
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
            "Content-Type": "application/json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "VigiliCloud",
        },
    )
    try:
        with _ur.urlopen(req, timeout=15) as resp:
            result = _json.loads(resp.read().decode())
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"GitHub API error: {str(e)[:200]}")

    return {"ok": True, "issue_number": result.get("number"), "issue_url": result.get("html_url", "")}


# ---------------------------------------------------------------------------
# Auto-verify after fix
# ---------------------------------------------------------------------------

@router.post("/scans/{scan_id}/verify-fix")
def verify_fix(
    scan_id: str,
    session_cookie: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
    authorization: Optional[str] = Header(default=None),
):
    """Trigger a fresh scan on the same account to verify that fixes resolved findings."""
    user = get_current_user(session_cookie, authorization)
    require_scan_owner(scan_id, user["id"])

    account_link = get_scan_account_link(scan_id)
    if not account_link:
        raise HTTPException(status_code=400, detail="This scan is not linked to a connected account.")

    accounts = list_connected_accounts(user_id=user["id"])
    account = next(
        (normalize_account_row(dict(a)) for a in accounts
         if a and str(a.get("id", "")) == str(account_link.get("account_id", ""))),
        None,
    )
    if not account:
        raise HTTPException(status_code=400, detail="Account not found or not accessible.")
    if not account.get("role_arn"):
        raise HTTPException(status_code=400, detail="Account has no IAM role configured.")

    def _run():
        run_account_scan(account, dict(user))

    threading.Thread(target=_run, daemon=True).start()
    return {"ok": True, "message": "Verification scan started. Check the Scans page in a few minutes."}
