"""
Scans router — /scans/*, /findings, /finding-actions/* endpoints.
"""
from __future__ import annotations

import csv
import io
import json
import os
import subprocess
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Body, Cookie, Header, HTTPException, Query, Request
from fastapi.responses import JSONResponse, StreamingResponse

from app.config import (
    PROJECT_ROOT,
    PYTHON_EXE,
    SCANNER_PATH,
    SCAN_RATE_LIMIT,
    SESSION_COOKIE_NAME,
)
from app.deps import (
    ActionIn,
    RunScanIn,
    RunScanResponse,
    _export_rows,
    assume_account_credentials,
    client_ip,
    enforce_rate_limit,
    enrich_scan,
    enrich_scans,
    get_actions,
    get_current_user,
    get_findings,
    get_fix_guidance,
    get_previous_scan_id,
    get_scan,
    get_scan_account_link,
    list_scans,
    require_account_linked_scan_access,
    require_export_access,
    require_scan_owner,
    sanitize_bucket_name,
    sanitize_note,
    sanitize_region,
    save_scan_account_link,
    send_critical_findings_email,
    update_scan_user_id,
    upsert_action,
    validate_account_or_404,
)

router = APIRouter()


@router.post("/scans/run", response_model=RunScanResponse)
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

    selected_account = validate_account_or_404(payload.account_id, user_id=user["id"])
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
    count = int(data.get("count", 0))

    if scan_id:
        update_scan_user_id(scan_id, user["id"])
        if selected_account:
            save_scan_account_link(scan_id, selected_account)

        findings = get_findings(scan_id)
        critical = [f for f in findings if f.get("severity") == "CRITICAL" and f.get("status") == "FAIL"]
        if critical:
            send_critical_findings_email(
                user_email=user.get("email", ""),
                user_name=user.get("name", ""),
                scan_id=scan_id,
                critical_count=len(critical),
                account_name=selected_account.get("account_name", "") if selected_account else "",
            )

    return {
        "scan_id": scan_id,
        "count": count,
        "account": get_scan_account_link(scan_id) if scan_id else None,
    }


@router.get("/scans/{scan_id}")
def read_scan(
    scan_id: str,
    session_cookie: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
    authorization: Optional[str] = Header(default=None),
):
    user = get_current_user(session_cookie, authorization)
    s = require_scan_owner(scan_id, user["id"])
    return enrich_scan(dict(s))


@router.get("/scans/{scan_id}/findings")
def read_findings(
    scan_id: str,
    session_cookie: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
    authorization: Optional[str] = Header(default=None),
):
    user = get_current_user(session_cookie, authorization)
    require_scan_owner(scan_id, user["id"])

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


@router.get("/scans/{scan_id}/drift")
def scan_drift(
    scan_id: str,
    session_cookie: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
    authorization: Optional[str] = Header(default=None),
):
    user = get_current_user(session_cookie, authorization)
    require_scan_owner(scan_id, user["id"])

    prev_scan_id = get_previous_scan_id(scan_id)
    if not prev_scan_id:
        return {
            "scan_id": scan_id,
            "previous_scan_id": None,
            "previous_scan_date": None,
            "summary": {"new": 0, "remediated": 0, "unchanged": 0},
            "has_baseline": False,
        }

    prev_scan = get_scan(prev_scan_id)
    prev_date = prev_scan["created_at"] if prev_scan else None

    current_findings = get_findings(scan_id)
    prev_findings = get_findings(prev_scan_id)

    prev_fail_keys: set = {
        (f["check_id"], f["resource_id"])
        for f in prev_findings
        if f.get("status") == "FAIL"
    }
    curr_fail_keys: set = {
        (f["check_id"], f["resource_id"])
        for f in current_findings
        if f.get("status") == "FAIL"
    }

    new_count = len(curr_fail_keys - prev_fail_keys)
    remediated_count = len(prev_fail_keys - curr_fail_keys)
    unchanged_count = len(curr_fail_keys & prev_fail_keys)

    drift_map: Dict[str, str] = {}
    for f in current_findings:
        if f.get("status") != "FAIL":
            continue
        key = (f["check_id"], f["resource_id"])
        drift_map[f"{f['check_id']}::{f['resource_id']}"] = (
            "NEW" if key not in prev_fail_keys else "UNCHANGED"
        )

    return {
        "scan_id": scan_id,
        "previous_scan_id": prev_scan_id,
        "previous_scan_date": prev_date,
        "summary": {
            "new": new_count,
            "remediated": remediated_count,
            "unchanged": unchanged_count,
        },
        "drift_map": drift_map,
        "has_baseline": True,
    }


@router.get("/scans")
def scans_list_endpoint(
    account_id: Optional[int] = Query(default=None),
    session_cookie: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
    authorization: Optional[str] = Header(default=None),
):
    user = get_current_user(session_cookie, authorization)
    rows = list_scans(50, account_id=account_id, user_id=user["id"])
    normalized = [dict(r) for r in rows]
    return {"scans": enrich_scans(normalized)}


@router.get("/findings")
def all_findings_endpoint(
    severity: Optional[str] = Query(default=None),
    service: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None),
    limit: int = Query(default=200, ge=1, le=1000),
    session_cookie: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
    authorization: Optional[str] = Header(default=None),
):
    user = get_current_user(session_cookie, authorization)
    scans = list_scans(20, user_id=user["id"])

    aggregated: List[Dict[str, Any]] = []
    for scan in scans:
        scan_id = scan["scan_id"] if isinstance(scan, dict) else scan.get("scan_id", "")
        if not scan_id:
            continue
        account = get_scan_account_link(scan_id)
        for f in get_findings(scan_id):
            row = dict(f)
            row["scan_id"] = scan_id
            row["account_id"] = account.get("account_id") if account else None
            row["customer_name"] = account.get("customer_name") if account else None
            row["account_name"] = account.get("account_name") if account else None
            row["aws_account_id"] = account.get("aws_account_id") if account else None
            row["region"] = account.get("region") if account else None
            aggregated.append(row)

    if severity:
        aggregated = [f for f in aggregated if f.get("severity", "").upper() == severity.upper()]
    if service:
        aggregated = [f for f in aggregated if f.get("service", "").upper() == service.upper()]
    if status:
        aggregated = [f for f in aggregated if f.get("status", "").upper() == status.upper()]

    aggregated.sort(
        key=lambda f: (
            {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3}.get(f.get("severity", "LOW"), 4),
            f.get("created_at", "") or "",
        ),
        reverse=False,
    )

    return {"findings": aggregated[:limit], "total": len(aggregated)}


@router.get("/finding-actions/{scan_id}")
def get_actions_for_scan(
    scan_id: str,
    session_cookie: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
    authorization: Optional[str] = Header(default=None),
):
    user = get_current_user(session_cookie, authorization)
    require_scan_owner(scan_id, user["id"])
    return {"scan_id": scan_id, "actions": get_actions(scan_id)}


@router.post("/finding-actions/{scan_id}/{check_id}")
def set_action(
    scan_id: str,
    check_id: str,
    resource_id: str,
    payload: ActionIn,
    session_cookie: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
    authorization: Optional[str] = Header(default=None),
):
    user = get_current_user(session_cookie, authorization)
    require_scan_owner(scan_id, user["id"])

    resolution = payload.action.upper()
    if resolution not in ("FIXED", "IGNORED"):
        raise HTTPException(status_code=400, detail="action must be FIXED or IGNORED")

    note = sanitize_note(payload.note)
    if len(resource_id or "") > 500:
        raise HTTPException(status_code=400, detail="resource_id is too long")

    upsert_action(scan_id, check_id, resource_id, resolution, note)
    return {"status": "ok"}


@router.post("/scans/{scan_id}/ai-analysis")
def ai_analysis(
    scan_id: str,
    session_cookie: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
    authorization: Optional[str] = Header(default=None),
):
    user = get_current_user(session_cookie, authorization)
    require_scan_owner(scan_id, user["id"])

    anthropic_key = os.getenv("ANTHROPIC_API_KEY", "").strip()
    if not anthropic_key:
        raise HTTPException(status_code=503, detail="AI analysis is not configured on this server.")

    rows = _export_rows(scan_id)
    if not rows:
        raise HTTPException(status_code=404, detail="Scan not found or has no findings.")

    import anthropic as _anthropic

    findings_summary = "\n".join(
        f"- [{r['severity']}] {r['service']}: {r['title']} (resource: {r['resource_id']}, status: {r['status']})"
        for r in rows[:40]
    )

    try:
        client = _anthropic.Anthropic(api_key=anthropic_key)
        response = client.messages.create(
            model="claude-haiku-4-5",
            max_tokens=1024,
            system=(
                "You are an AWS security expert reviewing compliance scan findings. "
                "Give concise, actionable analysis. Use bullet points. Be direct."
            ),
            messages=[
                {
                    "role": "user",
                    "content": (
                        f"Here are the findings from an AWS compliance scan:\n\n{findings_summary}\n\n"
                        "Provide:\n"
                        "1. A 2-sentence executive summary of the security posture.\n"
                        "2. The top 3 most critical issues to fix first and why.\n"
                        "3. Quick wins (issues easy to fix immediately).\n"
                        "4. Estimated remediation priority order."
                    ),
                }
            ],
        )
    except _anthropic.BadRequestError as e:
        raise HTTPException(status_code=402, detail=str(e))
    except _anthropic.AuthenticationError:
        raise HTTPException(status_code=503, detail="Invalid Anthropic API key.")
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"AI analysis failed: {str(e)}")

    analysis_text = next(
        (block.text for block in response.content if block.type == "text"), ""
    )
    return {"scan_id": scan_id, "analysis": analysis_text, "findings_count": len(rows)}


@router.post("/scans/{scan_id}/ticket-draft")
def ticket_draft(
    scan_id: str,
    check_id: str = Query(...),
    resource_id: str = Query(...),
    fmt: str = Query(default="jira", alias="format"),
    session_cookie: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
    authorization: Optional[str] = Header(default=None),
):
    user = get_current_user(session_cookie, authorization)
    require_scan_owner(scan_id, user["id"])

    if fmt not in ("jira", "github"):
        raise HTTPException(status_code=400, detail="format must be 'jira' or 'github'")
    if len(check_id) > 200 or len(resource_id) > 500:
        raise HTTPException(status_code=400, detail="check_id or resource_id too long")

    findings = get_findings(scan_id)
    finding = next(
        (f for f in findings if f["check_id"] == check_id and f["resource_id"] == resource_id),
        None,
    )
    if not finding:
        raise HTTPException(status_code=404, detail="Finding not found in this scan")

    guidance = get_fix_guidance(check_id)

    steps_text = "\n".join(f"{i+1}. {s}" for i, s in enumerate(guidance["steps"])) if guidance else ""
    cli_text = "\n".join(guidance["cli"]) if guidance else ""
    summary_text = guidance["summary"] if guidance else finding.get("title", "")

    anthropic_key = os.getenv("ANTHROPIC_API_KEY", "").strip()
    if not anthropic_key:
        raise HTTPException(status_code=503, detail="AI ticket generation is not configured on this server.")

    if fmt == "jira":
        format_instructions = (
            "Format as a Jira ticket using Jira wiki markup (h2. headings, {code:bash} blocks, # lists for steps, * for bullet points). "
            "Include: Title line (no heading), then Priority, Labels, then sections: "
            "h2. Summary, h2. Affected Resource, h2. Risk, h2. Steps to Remediate, "
            "h2. CLI Remediation (in {code:bash} block), h2. Acceptance Criteria (checkboxes as * [ ]), h2. References."
        )
    else:
        format_instructions = (
            "Format as a GitHub issue using Markdown. "
            "Start with a bold metadata block (Service, Resource, Severity, Check, Detected, Scan ID), then sections: "
            "## Summary, ## Risk, ## Steps to Remediate (numbered), ## CLI Remediation (```bash block), "
            "## Acceptance Criteria (- [ ] checkboxes). End with a horizontal rule and attribution line."
        )

    finding_info = (
        f"Title: {finding.get('title', '')}\n"
        f"Service: {finding.get('service', '')}\n"
        f"Severity: {finding.get('severity', '')}\n"
        f"Check ID: {check_id}\n"
        f"Resource: {resource_id}\n"
        f"Scan ID: {scan_id}\n"
        f"Detected: {finding.get('created_at', '')[:10]}\n"
        f"Summary: {summary_text}\n"
        f"Fix Steps:\n{steps_text}\n"
        f"CLI:\n{cli_text}"
    )

    try:
        import anthropic as _anthropic
        client = _anthropic.Anthropic(api_key=anthropic_key)
        response = client.messages.create(
            model="claude-haiku-4-5",
            max_tokens=1200,
            system=(
                "You are a senior DevSecOps engineer writing compliance remediation tickets. "
                "Write clearly and concisely. Every ticket must be immediately actionable — "
                "an engineer reading it should know exactly what to do without needing to look anything up."
            ),
            messages=[{
                "role": "user",
                "content": (
                    f"Generate a {fmt.upper()} ticket for this AWS compliance finding:\n\n"
                    f"{finding_info}\n\n"
                    f"{format_instructions}\n\n"
                    "Output only the ticket content, nothing else."
                ),
            }],
        )
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Ticket generation failed: {str(e)}")

    ticket_text = next((b.text for b in response.content if b.type == "text"), "")
    return {"scan_id": scan_id, "check_id": check_id, "resource_id": resource_id, "format": fmt, "ticket": ticket_text}


@router.get("/scans/{scan_id}/export.pdf")
def export_scan_pdf(
    scan_id: str,
    session_cookie: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
    authorization: Optional[str] = Header(default=None),
):
    user = get_current_user(session_cookie, authorization)
    require_export_access(user)
    s = require_scan_owner(scan_id, user["id"])

    rows = _export_rows(scan_id)
    account = get_scan_account_link(scan_id)
    scan_data = enrich_scan(dict(s))

    try:
        from fpdf import FPDF
    except ImportError:
        raise HTTPException(status_code=503, detail="PDF export not available (fpdf2 not installed).")

    SEV_ORDER = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3}
    SEV_COLORS = {
        "CRITICAL": (220, 38, 38),
        "HIGH": (234, 88, 12),
        "MEDIUM": (202, 138, 4),
        "LOW": (37, 99, 235),
    }

    fail_rows = [r for r in rows if r.get("status") == "FAIL"]
    pass_rows = [r for r in rows if r.get("status") == "PASS"]
    counts: Dict[str, int] = {}
    for r in fail_rows:
        sev = r.get("severity", "LOW")
        counts[sev] = counts.get(sev, 0) + 1

    scan_date = (scan_data.get("created_at") or "")[:10]
    acct_name = account.get("account_name", "") if account else ""
    aws_id = account.get("aws_account_id", "") if account else ""
    region = account.get("region", "") if account else ""

    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=15)

    # ── Cover page ──────────────────────────────────────────────────────────
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 28)
    pdf.set_text_color(16, 185, 129)
    pdf.ln(20)
    pdf.cell(0, 14, "VigiliCloud", align="C")
    pdf.ln(14)
    pdf.set_font("Helvetica", "", 14)
    pdf.set_text_color(120, 120, 120)
    pdf.cell(0, 10, "AWS Compliance Evidence Pack", align="C")
    pdf.ln(20)

    pdf.set_draw_color(40, 40, 40)
    pdf.set_line_width(0.3)
    pdf.line(20, pdf.get_y(), 190, pdf.get_y())
    pdf.ln(10)

    def meta_row(label: str, value: str) -> None:
        pdf.set_font("Helvetica", "B", 11)
        pdf.set_text_color(80, 80, 80)
        pdf.cell(55, 8, label)
        pdf.set_font("Helvetica", "", 11)
        pdf.set_text_color(30, 30, 30)
        pdf.cell(0, 8, value[:80])
        pdf.ln(8)

    meta_row("Scan ID:", scan_id)
    meta_row("Generated:", scan_date)
    if acct_name:
        meta_row("Account:", f"{acct_name}  ({aws_id})")
    if region:
        meta_row("Region:", region)
    meta_row("Total Findings:", str(len(rows)))
    meta_row("Failing Controls:", str(len(fail_rows)))
    meta_row("Passing Controls:", str(len(pass_rows)))
    meta_row("Framework:", "CIS AWS Foundations Benchmark v1.4")

    pdf.ln(10)
    pdf.line(20, pdf.get_y(), 190, pdf.get_y())
    pdf.ln(10)

    # Severity summary boxes
    pdf.set_font("Helvetica", "B", 12)
    pdf.set_text_color(30, 30, 30)
    pdf.cell(0, 8, "Severity Breakdown")
    pdf.ln(10)

    box_w = 38
    for sev in ["CRITICAL", "HIGH", "MEDIUM", "LOW"]:
        count = counts.get(sev, 0)
        r, g, b = SEV_COLORS.get(sev, (80, 80, 80))
        pdf.set_fill_color(r, g, b)
        pdf.set_text_color(255, 255, 255)
        pdf.set_font("Helvetica", "B", 10)
        pdf.cell(box_w, 7, sev, border=0, fill=True, align="C")
        pdf.set_font("Helvetica", "B", 18)
        pdf.ln(7)
        pdf.set_fill_color(r + 30 if r + 30 <= 255 else 255, g + 30 if g + 30 <= 255 else 255, b + 30 if b + 30 <= 255 else 255)
        pdf.set_x(pdf.get_x())
        # reposition to right column
    # draw them side by side
    pdf.set_y(pdf.get_y() - 7)
    x_start = 20
    for sev in ["CRITICAL", "HIGH", "MEDIUM", "LOW"]:
        count = counts.get(sev, 0)
        r, g, b = SEV_COLORS.get(sev, (80, 80, 80))
        pdf.set_x(x_start)
        pdf.set_fill_color(r, g, b)
        pdf.set_text_color(255, 255, 255)
        pdf.set_font("Helvetica", "B", 9)
        pdf.cell(box_w - 2, 6, sev, border=0, fill=True, align="C")
        x_start += box_w
    pdf.ln(6)
    x_start = 20
    for sev in ["CRITICAL", "HIGH", "MEDIUM", "LOW"]:
        count = counts.get(sev, 0)
        r, g, b = SEV_COLORS.get(sev, (80, 80, 80))
        pdf.set_x(x_start)
        pdf.set_fill_color(r + 20 if r + 20 <= 255 else 255, g + 20 if g + 20 <= 255 else 255, b + 20 if b + 20 <= 255 else 255)
        pdf.set_text_color(255, 255, 255)
        pdf.set_font("Helvetica", "B", 20)
        pdf.cell(box_w - 2, 14, str(count), border=0, fill=True, align="C")
        x_start += box_w
    pdf.ln(20)

    # ── Findings table ────────────────────────────────────────────────────
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 14)
    pdf.set_text_color(30, 30, 30)
    pdf.cell(0, 10, "Findings Detail (FAIL)")
    pdf.ln(12)

    col_w = [22, 20, 52, 72, 14]
    headers = ["Severity", "Service", "Check ID", "Resource", "Status"]

    pdf.set_fill_color(30, 30, 30)
    pdf.set_text_color(255, 255, 255)
    pdf.set_font("Helvetica", "B", 8)
    for i, h in enumerate(headers):
        pdf.cell(col_w[i], 7, h, border=1, fill=True, align="C")
    pdf.ln(7)

    sorted_fail = sorted(fail_rows, key=lambda r: SEV_ORDER.get(r.get("severity", "LOW"), 4))
    pdf.set_font("Helvetica", "", 7)

    for row in sorted_fail:
        sev = str(row.get("severity", ""))
        r, g, b = SEV_COLORS.get(sev, (80, 80, 80))
        pdf.set_text_color(r, g, b)
        pdf.set_font("Helvetica", "B", 7)
        pdf.cell(col_w[0], 6, sev[:20], border=1)
        pdf.set_text_color(30, 30, 30)
        pdf.set_font("Helvetica", "", 7)
        pdf.cell(col_w[1], 6, str(row.get("service", ""))[:18], border=1)
        pdf.cell(col_w[2], 6, str(row.get("check_id", ""))[:38], border=1)
        res = str(row.get("resource_id", ""))
        pdf.cell(col_w[3], 6, res[:55] if len(res) <= 55 else res[:52] + "...", border=1)
        pdf.set_text_color(220, 38, 38)
        pdf.set_font("Helvetica", "B", 7)
        pdf.cell(col_w[4], 6, "FAIL", border=1, align="C")
        pdf.set_text_color(30, 30, 30)
        pdf.set_font("Helvetica", "", 7)
        pdf.ln(6)

    # Passing controls
    if pass_rows:
        pdf.ln(6)
        pdf.set_font("Helvetica", "B", 14)
        pdf.set_text_color(30, 30, 30)
        pdf.cell(0, 10, "Passing Controls")
        pdf.ln(12)

        pdf.set_fill_color(30, 30, 30)
        pdf.set_text_color(255, 255, 255)
        pdf.set_font("Helvetica", "B", 8)
        pass_cols = [20, 52, 100]
        for h, w in zip(["Service", "Check ID", "Resource"], pass_cols):
            pdf.cell(w, 7, h, border=1, fill=True, align="C")
        pdf.ln(7)

        pdf.set_font("Helvetica", "", 7)
        for row in pass_rows:
            pdf.set_text_color(16, 185, 129)
            pdf.cell(pass_cols[0], 6, str(row.get("service", ""))[:18], border=1)
            pdf.set_text_color(30, 30, 30)
            pdf.cell(pass_cols[1], 6, str(row.get("check_id", ""))[:38], border=1)
            res = str(row.get("resource_id", ""))
            pdf.cell(pass_cols[2], 6, res[:70] if len(res) <= 70 else res[:67] + "...", border=1)
            pdf.ln(6)

    # Footer
    pdf.ln(10)
    pdf.set_font("Helvetica", "I", 8)
    pdf.set_text_color(150, 150, 150)
    pdf.cell(0, 5, f"Generated by VigiliCloud | {scan_date} | CIS AWS Foundations Benchmark v1.4", align="C")

    pdf_bytes = bytes(pdf.output())
    filename = f"vigilicloud-evidence-{scan_id[:8]}.pdf"
    return StreamingResponse(
        iter([pdf_bytes]),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/scans/{scan_id}/questionnaire")
def generate_questionnaire(
    scan_id: str,
    framework: str = Query(default="soc2"),
    session_cookie: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
    authorization: Optional[str] = Header(default=None),
):
    user = get_current_user(session_cookie, authorization)
    require_scan_owner(scan_id, user["id"])

    if framework not in ("soc2", "iso27001", "pci"):
        raise HTTPException(status_code=400, detail="framework must be soc2, iso27001, or pci")

    anthropic_key = os.getenv("ANTHROPIC_API_KEY", "").strip()
    if not anthropic_key:
        raise HTTPException(status_code=503, detail="Questionnaire generation is not configured.")

    rows = _export_rows(scan_id)
    if not rows:
        raise HTTPException(status_code=404, detail="Scan not found or has no findings.")

    fail_findings = [r for r in rows if r.get("status") == "FAIL"]
    pass_findings = [r for r in rows if r.get("status") == "PASS"]

    fail_summary = "\n".join(
        f"FAIL [{r.get('severity')}] {r.get('service')}: {r.get('check_id')} on {r.get('resource_id', '')[:60]}"
        for r in fail_findings[:30]
    )
    pass_summary = "\n".join(
        f"PASS {r.get('service')}: {r.get('check_id')}"
        for r in pass_findings[:20]
    )

    framework_questions: Dict[str, str] = {
        "soc2": (
            "SOC 2 Trust Services Criteria — answer each:\n"
            "CC6.1: How does the organization implement logical access controls?\n"
            "CC6.6: How does the organization manage network security?\n"
            "CC6.7: How does the organization protect data in transit and at rest?\n"
            "CC7.2: How does the organization monitor for security incidents?\n"
            "A1.2: How does the organization protect system availability?\n"
            "C1.1: How does the organization protect the confidentiality of information?"
        ),
        "iso27001": (
            "ISO 27001:2022 Annex A — answer each:\n"
            "A.5.15: How does the organization control access to information assets?\n"
            "A.8.3: How does the organization protect information access rights?\n"
            "A.8.20: How does the organization implement network security controls?\n"
            "A.8.24: How does the organization apply cryptographic controls?\n"
            "A.8.15: How does the organization implement logging and monitoring?\n"
            "A.5.33: How does the organization protect records and audit evidence?"
        ),
        "pci": (
            "PCI DSS v4.0 Requirements — answer each:\n"
            "Req 1: How does the organization install and maintain network security controls?\n"
            "Req 2: How are secure configurations applied to all system components?\n"
            "Req 3: How does the organization protect stored account data (encryption)?\n"
            "Req 7: How is access to system components restricted by least privilege?\n"
            "Req 8: How are users identified and authenticated to system components?\n"
            "Req 10: How is all access to system components logged and monitored?"
        ),
    }

    try:
        import anthropic as _anthropic
        client = _anthropic.Anthropic(api_key=anthropic_key)
        response = client.messages.create(
            model="claude-haiku-4-5",
            max_tokens=2000,
            system=(
                "You are a compliance expert helping organizations answer security questionnaires. "
                "Generate honest, specific answers based on AWS scan evidence. "
                "Where controls pass, cite them as evidence. Where controls fail, acknowledge the gap "
                "and note that remediation is in progress. Use professional language for audits."
            ),
            messages=[{
                "role": "user",
                "content": (
                    f"Answer the following {framework.upper()} questionnaire based on our AWS compliance scan:\n\n"
                    f"FAILING CONTROLS ({len(fail_findings)}):\n{fail_summary}\n\n"
                    f"PASSING CONTROLS ({len(pass_findings)}):\n{pass_summary}\n\n"
                    f"{framework_questions[framework]}\n\n"
                    "For each item: 2-3 sentences, cite specific scan evidence, acknowledge gaps honestly.\n"
                    "Format: **[Control ID]: [Question summary]**\n[Answer]\n\n"
                ),
            }],
        )
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Questionnaire generation failed: {str(e)}")

    text = next((b.text for b in response.content if b.type == "text"), "")
    return {
        "scan_id": scan_id,
        "framework": framework.upper(),
        "questionnaire": text,
        "findings_analyzed": len(rows),
    }


@router.get("/scans/{scan_id}/export.json")
def export_scan_json(
    scan_id: str,
    session_cookie: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
    authorization: Optional[str] = Header(default=None),
):
    user = get_current_user(session_cookie, authorization)
    require_export_access(user)
    s = require_scan_owner(scan_id, user["id"])

    rows = _export_rows(scan_id)
    return JSONResponse(
        {
            "scan": enrich_scan(dict(s)),
            "rows": rows,
            "account": get_scan_account_link(scan_id),
        }
    )


@router.get("/scans/{scan_id}/export.csv")
def export_scan_csv(
    scan_id: str,
    session_cookie: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
    authorization: Optional[str] = Header(default=None),
):
    user = get_current_user(session_cookie, authorization)
    require_export_access(user)
    require_scan_owner(scan_id, user["id"])

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
