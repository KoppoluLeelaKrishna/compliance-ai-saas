"""
Auto-remediation router — /remediation/*
Applies AWS fixes directly via boto3 for supported check_ids.
Requires the same IAM role used for scanning, but with write permissions.
"""
from __future__ import annotations

import json
from typing import Any, Dict, Optional

from fastapi import APIRouter, Cookie, Header, HTTPException
from pydantic import BaseModel

from app.config import SESSION_COOKIE_NAME
from app.deps import (
    assume_account_credentials,
    get_conn,
    get_current_user,
    get_findings,
    get_scan_account_link,
    now_utc_iso,
    require_non_viewer,
    require_scan_owner,
    upsert_action,
)

router = APIRouter(prefix="/remediation")

# ---------------------------------------------------------------------------
# Which check_ids we can auto-fix and how
# ---------------------------------------------------------------------------

REMEDIABLE_CHECKS: Dict[str, Dict[str, Any]] = {
    "S3_PUBLIC_ACCESS_BLOCK_OFF": {
        "title": "Enable S3 Block Public Access",
        "description": "Enables all 4 Block Public Access settings on the bucket.",
        "risk": "low",
    },
    "S3_BUCKET_ACL_PUBLIC": {
        "title": "Set S3 bucket ACL to private",
        "description": "Changes the bucket ACL to private, removing public grants.",
        "risk": "medium",
    },
    "EC2_EBS_DEFAULT_ENCRYPTION_OFF": {
        "title": "Enable EBS default encryption",
        "description": "Enables EBS encryption by default for the account in this region.",
        "risk": "low",
    },
    "CLOUDTRAIL_NOT_LOGGING": {
        "title": "Start CloudTrail logging",
        "description": "Calls StartLogging on the identified trail.",
        "risk": "low",
    },
    "CLOUDTRAIL_LOG_VALIDATION_DISABLED": {
        "title": "Enable CloudTrail log validation",
        "description": "Enables log file integrity validation on the trail.",
        "risk": "low",
    },
    "GITHUB_ORG_MFA_NOT_REQUIRED": {
        "title": "Enforce 2FA on GitHub org",
        "description": "Requires 2FA for all members. Members without 2FA will be removed.",
        "risk": "high",
    },
}


class RemediateIn(BaseModel):
    confirm: bool = False  # must be True to execute


@router.get("/checks")
def list_remediable():
    """Return the list of check_ids that support auto-remediation."""
    return {"checks": REMEDIABLE_CHECKS}


@router.post("/scans/{scan_id}/findings/{check_id}")
def remediate_finding(
    scan_id: str,
    check_id: str,
    payload: RemediateIn,
    resource_id: str = "",
    session_cookie: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
    authorization: Optional[str] = Header(default=None),
):
    user = get_current_user(session_cookie, authorization)
    require_non_viewer(user)
    require_scan_owner(scan_id, user["id"])

    if check_id not in REMEDIABLE_CHECKS:
        raise HTTPException(status_code=400, detail=f"Auto-remediation not supported for {check_id}")

    if not payload.confirm:
        return {
            "dry_run": True,
            "check_id": check_id,
            "action": REMEDIABLE_CHECKS[check_id]["title"],
            "description": REMEDIABLE_CHECKS[check_id]["description"],
            "risk": REMEDIABLE_CHECKS[check_id]["risk"],
            "message": "Pass confirm=true to execute this remediation.",
        }

    # Load the finding to get resource details
    findings = get_findings(scan_id)
    target = next(
        (f for f in findings
         if f["check_id"] == check_id and (not resource_id or f["resource_id"] == resource_id)),
        None,
    )
    if not target:
        raise HTTPException(status_code=404, detail="Finding not found in this scan")

    # Get AWS credentials via the linked account
    link = get_scan_account_link(scan_id)
    if not link:
        raise HTTPException(status_code=422, detail="Scan has no linked AWS account — cannot remediate")

    try:
        creds = assume_account_credentials(
            role_arn=link["role_arn"],
            external_id=link.get("external_id", ""),
            region=link.get("region", "us-east-1"),
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Could not assume AWS role: {e}")

    region = link.get("region", "us-east-1")
    result = _apply_remediation(check_id, target, creds, region)

    # Mark finding as FIXED in finding_actions
    upsert_action(
        scan_id=scan_id,
        check_id=check_id,
        resource_id=target["resource_id"],
        resolution="FIXED",
        note=f"Auto-remediated by {user['email']} at {now_utc_iso()}",
    )

    return {
        "status": "remediated",
        "check_id": check_id,
        "resource_id": target["resource_id"],
        "action": REMEDIABLE_CHECKS[check_id]["title"],
        "detail": result,
        "remediated_at": now_utc_iso(),
        "remediated_by": user["email"],
    }


def _apply_remediation(
    check_id: str,
    finding: Dict[str, Any],
    creds: Dict[str, str],
    region: str,
) -> str:
    import boto3

    session = boto3.Session(
        aws_access_key_id=creds["aws_access_key_id"],
        aws_secret_access_key=creds["aws_secret_access_key"],
        aws_session_token=creds.get("aws_session_token"),
        region_name=region,
    )

    resource_id = finding.get("resource_id", "")
    evidence = finding.get("evidence") or {}
    if isinstance(evidence, str):
        try:
            evidence = json.loads(evidence)
        except Exception:
            evidence = {}

    if check_id == "S3_PUBLIC_ACCESS_BLOCK_OFF":
        bucket = resource_id.replace("s3://", "").split("/")[0]
        s3 = session.client("s3")
        s3.put_public_access_block(
            Bucket=bucket,
            PublicAccessBlockConfiguration={
                "BlockPublicAcls": True,
                "IgnorePublicAcls": True,
                "BlockPublicPolicy": True,
                "RestrictPublicBuckets": True,
            },
        )
        return f"Block Public Access enabled on s3://{bucket}"

    if check_id == "S3_BUCKET_ACL_PUBLIC":
        bucket = resource_id.replace("s3://", "").split("/")[0]
        s3 = session.client("s3")
        s3.put_bucket_acl(Bucket=bucket, ACL="private")
        return f"ACL set to private on s3://{bucket}"

    if check_id == "EC2_EBS_DEFAULT_ENCRYPTION_OFF":
        ec2 = session.client("ec2", region_name=region)
        ec2.enable_ebs_encryption_by_default()
        return f"EBS default encryption enabled in {region}"

    if check_id == "CLOUDTRAIL_NOT_LOGGING":
        trail_arn = evidence.get("TrailARN") or evidence.get("trail_arn") or resource_id
        ct = session.client("cloudtrail", region_name=region)
        ct.start_logging(Name=trail_arn)
        return f"CloudTrail logging started for {trail_arn}"

    if check_id == "CLOUDTRAIL_LOG_VALIDATION_DISABLED":
        trail_arn = evidence.get("TrailARN") or evidence.get("trail_arn") or resource_id
        ct = session.client("cloudtrail", region_name=region)
        ct.update_trail(Name=trail_arn, EnableLogFileValidation=True)
        return f"Log file validation enabled for {trail_arn}"

    raise HTTPException(status_code=400, detail=f"No remediation handler for {check_id}")


# ---------------------------------------------------------------------------
# Evidence snapshot endpoints
# ---------------------------------------------------------------------------

@router.get("/scans/{scan_id}/evidence")
def get_evidence_for_scan(
    scan_id: str,
    check_id: Optional[str] = None,
    session_cookie: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
    authorization: Optional[str] = Header(default=None),
):
    """Return timestamped evidence snapshots for a scan, optionally filtered by check_id."""
    user = get_current_user(session_cookie, authorization)
    require_scan_owner(scan_id, user["id"])

    conn = get_conn()
    if check_id:
        rows = conn.execute(
            "SELECT * FROM evidence_snapshots WHERE scan_id=? AND check_id=? ORDER BY collected_at ASC",
            (scan_id, check_id),
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM evidence_snapshots WHERE scan_id=? ORDER BY check_id, collected_at ASC",
            (scan_id,),
        ).fetchall()
    conn.close()

    return {
        "scan_id": scan_id,
        "snapshots": [dict(r) for r in rows],
    }


@router.get("/controls/{check_id}/history")
def get_control_history(
    check_id: str,
    limit: int = 30,
    session_cookie: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
    authorization: Optional[str] = Header(default=None),
):
    """Return the status history for a specific control across all scans (for SOC2 Type II evidence)."""
    user = get_current_user(session_cookie, authorization)

    conn = get_conn()
    rows = conn.execute(
        """
        SELECT es.*, s.created_at as scan_date
        FROM evidence_snapshots es
        JOIN scans s ON s.scan_id = es.scan_id
        WHERE es.check_id = ? AND s.user_id = ?
        ORDER BY es.collected_at DESC
        LIMIT ?
        """,
        (check_id, user["id"], limit),
    ).fetchall()
    conn.close()

    history = [dict(r) for r in rows]
    pass_count = sum(1 for r in history if r["status"] == "PASS")
    total = len(history)

    return {
        "check_id": check_id,
        "history": history,
        "pass_rate": round(pass_count / total * 100) if total else 100,
        "total_observations": total,
        "period_start": history[-1]["collected_at"] if history else None,
        "period_end": history[0]["collected_at"] if history else None,
    }
