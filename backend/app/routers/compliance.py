"""
Compliance router — /compliance/* endpoints.
Maps VigiliCloud check_ids to SOC2, ISO 27001, and PCI DSS controls.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Cookie, Header, HTTPException, Query
from app.config import SESSION_COOKIE_NAME
from app.deps import get_current_user, get_findings, get_scan, require_scan_owner

router = APIRouter(prefix="/compliance")

# ---------------------------------------------------------------------------
# Control mapping — each check maps to one or more framework controls
# ---------------------------------------------------------------------------

COMPLIANCE_CONTROLS: Dict[str, Dict[str, Any]] = {
    # ── S3 ──────────────────────────────────────────────────────────────────
    "S3_PUBLIC_ACCESS_BLOCK_OFF": {
        "title": "S3 Block Public Access Disabled",
        "soc2": ["CC6.1", "CC6.6", "CC6.7"],
        "iso27001": ["A.13.1.3", "A.14.1.2"],
        "pci_dss": ["1.3", "7.1"],
        "nist": ["AC-3", "AC-6", "SC-7"],
        "description": "S3 bucket does not have Block Public Access enabled",
    },
    "S3_BUCKET_ACL_PUBLIC": {
        "title": "S3 Bucket ACL Allows Public Access",
        "soc2": ["CC6.1", "CC6.6"],
        "iso27001": ["A.13.1.3"],
        "pci_dss": ["1.3"],
        "nist": ["AC-3", "SC-7"],
        "description": "S3 bucket ACL grants public read or write access",
    },
    "S3_BUCKET_POLICY_PUBLIC": {
        "title": "S3 Bucket Policy Allows Public Access",
        "soc2": ["CC6.1", "CC6.6"],
        "iso27001": ["A.13.1.3"],
        "pci_dss": ["1.3"],
        "nist": ["AC-3", "SC-7"],
        "description": "S3 bucket policy allows unauthenticated public access",
    },
    # ── IAM ─────────────────────────────────────────────────────────────────
    "IAM_ADMIN_MANAGED_POLICY": {
        "title": "IAM Role Has Admin Managed Policy",
        "soc2": ["CC6.1", "CC6.3"],
        "iso27001": ["A.9.2.3", "A.9.4.1"],
        "pci_dss": ["7.1", "7.2"],
        "nist": ["AC-2", "AC-6"],
        "description": "IAM role has AdministratorAccess or equivalent attached",
    },
    "IAM_ROOT_ACCESS_KEY_ACTIVE": {
        "title": "Root Account Has Active Access Keys",
        "soc2": ["CC6.1", "CC6.2"],
        "iso27001": ["A.9.2.3"],
        "pci_dss": ["8.1"],
        "nist": ["AC-2", "IA-2"],
        "description": "AWS root account has active programmatic access keys",
    },
    "IAM_ROOT_NO_MFA": {
        "title": "Root Account MFA Not Enabled",
        "soc2": ["CC6.1", "CC6.2"],
        "iso27001": ["A.9.4.2"],
        "pci_dss": ["8.3"],
        "nist": ["IA-2"],
        "description": "MFA is not enabled on the root account",
    },
    "IAM_USER_NO_MFA": {
        "title": "IAM User MFA Not Enabled",
        "soc2": ["CC6.1", "CC6.2"],
        "iso27001": ["A.9.4.2"],
        "pci_dss": ["8.3"],
        "nist": ["IA-2"],
        "description": "IAM user with console access does not have MFA enabled",
    },
    # ── EC2 / Security Groups ────────────────────────────────────────────────
    "EC2_SG_ALL_TRAFFIC_OPEN": {
        "title": "Security Group Allows All Inbound Traffic",
        "soc2": ["CC6.6", "CC6.7"],
        "iso27001": ["A.13.1.1", "A.13.1.3"],
        "pci_dss": ["1.2", "1.3"],
        "nist": ["SC-7", "AC-4"],
        "description": "Security group allows unrestricted inbound traffic (0.0.0.0/0)",
    },
    "EC2_SG_SSH_RDP_OPEN": {
        "title": "Security Group Exposes SSH/RDP",
        "soc2": ["CC6.6", "CC6.7"],
        "iso27001": ["A.13.1.1", "A.13.1.3"],
        "pci_dss": ["1.2", "1.3"],
        "nist": ["SC-7", "AC-4"],
        "description": "Security group allows public SSH (22) or RDP (3389) access",
    },
    # ── EBS ─────────────────────────────────────────────────────────────────
    "EC2_EBS_DEFAULT_ENCRYPTION_OFF": {
        "title": "EBS Default Encryption Disabled",
        "soc2": ["CC6.1", "CC9.1"],
        "iso27001": ["A.10.1.1", "A.18.1.3"],
        "pci_dss": ["3.4"],
        "nist": ["SC-28"],
        "description": "EBS encryption by default is not enabled for this region",
    },
    "EC2_EBS_VOLUME_UNENCRYPTED": {
        "title": "Unencrypted EBS Volume",
        "soc2": ["CC6.1", "CC9.1"],
        "iso27001": ["A.10.1.1"],
        "pci_dss": ["3.4"],
        "nist": ["SC-28"],
        "description": "EBS volume is not encrypted at rest",
    },
    # ── CloudTrail ───────────────────────────────────────────────────────────
    "CLOUDTRAIL_NO_TRAIL": {
        "title": "No CloudTrail Trail Configured",
        "soc2": ["CC7.1", "CC7.2", "CC4.1"],
        "iso27001": ["A.12.4.1", "A.16.1.2"],
        "pci_dss": ["10.1", "10.2"],
        "nist": ["AU-2", "AU-12"],
        "description": "No CloudTrail trail exists in this account",
    },
    "CLOUDTRAIL_NOT_LOGGING": {
        "title": "CloudTrail Not Actively Logging",
        "soc2": ["CC7.1", "CC7.2"],
        "iso27001": ["A.12.4.1"],
        "pci_dss": ["10.1"],
        "nist": ["AU-2", "AU-12"],
        "description": "CloudTrail trail exists but logging is disabled",
    },
    "CLOUDTRAIL_LOG_VALIDATION_DISABLED": {
        "title": "CloudTrail Log File Validation Disabled",
        "soc2": ["CC7.2", "CC4.1"],
        "iso27001": ["A.12.4.2"],
        "pci_dss": ["10.5"],
        "nist": ["AU-9"],
        "description": "CloudTrail log file integrity validation is not enabled",
    },
    "CLOUDTRAIL_NOT_MULTI_REGION": {
        "title": "CloudTrail Not Multi-Region",
        "soc2": ["CC7.1", "CC4.1"],
        "iso27001": ["A.12.4.1"],
        "pci_dss": ["10.1"],
        "nist": ["AU-2"],
        "description": "CloudTrail is not capturing events from all regions",
    },
    # ── VPC ─────────────────────────────────────────────────────────────────
    "VPC_FLOW_LOGS_DISABLED": {
        "title": "VPC Flow Logs Disabled",
        "soc2": ["CC7.1", "CC7.2"],
        "iso27001": ["A.12.4.1", "A.13.1.1"],
        "pci_dss": ["10.2", "10.7"],
        "nist": ["AU-2", "SI-4"],
        "description": "VPC flow logs are not enabled — network traffic is not captured",
    },
    # ── KMS ─────────────────────────────────────────────────────────────────
    "KMS_KEY_ROTATION_DISABLED": {
        "title": "KMS Key Rotation Disabled",
        "soc2": ["CC6.1", "CC9.1"],
        "iso27001": ["A.10.1.2"],
        "pci_dss": ["3.6"],
        "nist": ["SC-12"],
        "description": "KMS customer-managed key does not have automatic rotation enabled",
    },
    # ── RDS ─────────────────────────────────────────────────────────────────
    "RDS_STORAGE_NOT_ENCRYPTED": {
        "title": "RDS Instance Storage Not Encrypted",
        "soc2": ["CC6.1", "CC9.1"],
        "iso27001": ["A.10.1.1"],
        "pci_dss": ["3.4"],
        "nist": ["SC-28"],
        "description": "RDS instance does not have storage encryption enabled",
    },
    "RDS_PUBLICLY_ACCESSIBLE": {
        "title": "RDS Instance Publicly Accessible",
        "soc2": ["CC6.1", "CC6.6"],
        "iso27001": ["A.13.1.3", "A.14.1.2"],
        "pci_dss": ["1.3"],
        "nist": ["AC-3", "SC-7"],
        "description": "RDS instance has PubliclyAccessible set to true",
    },
}

# Framework-level summaries for audit questionnaires
FRAMEWORK_SUMMARIES = {
    "soc2": {
        "name": "SOC 2 Type II",
        "controls_covered": sorted({
            c for mapping in COMPLIANCE_CONTROLS.values()
            for c in mapping.get("soc2", [])
        }),
    },
    "iso27001": {
        "name": "ISO/IEC 27001:2022",
        "controls_covered": sorted({
            c for mapping in COMPLIANCE_CONTROLS.values()
            for c in mapping.get("iso27001", [])
        }),
    },
    "pci_dss": {
        "name": "PCI DSS v4.0",
        "controls_covered": sorted({
            c for mapping in COMPLIANCE_CONTROLS.values()
            for c in mapping.get("pci_dss", [])
        }),
    },
    "nist": {
        "name": "NIST SP 800-53",
        "controls_covered": sorted({
            c for mapping in COMPLIANCE_CONTROLS.values()
            for c in mapping.get("nist", [])
        }),
    },
}


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/mappings")
def get_all_mappings(
    framework: Optional[str] = Query(default=None, description="Filter by framework: soc2|iso27001|pci_dss|nist"),
    session_cookie: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
    authorization: Optional[str] = Header(default=None),
):
    get_current_user(session_cookie, authorization)
    if framework and framework not in FRAMEWORK_SUMMARIES:
        raise HTTPException(status_code=400, detail="Unknown framework. Use: soc2, iso27001, pci_dss, nist")
    return {
        "mappings": COMPLIANCE_CONTROLS,
        "frameworks": FRAMEWORK_SUMMARIES,
    }


@router.get("/mappings/{check_id}")
def get_mapping_for_check(
    check_id: str,
    session_cookie: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
    authorization: Optional[str] = Header(default=None),
):
    get_current_user(session_cookie, authorization)
    mapping = COMPLIANCE_CONTROLS.get(check_id.upper())
    if not mapping:
        return {"check_id": check_id, "mapped": False, "controls": {}}
    return {"check_id": check_id, "mapped": True, "controls": mapping}


@router.get("/scans/{scan_id}/coverage")
def scan_compliance_coverage(
    scan_id: str,
    session_cookie: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
    authorization: Optional[str] = Header(default=None),
):
    """Return per-framework compliance coverage for a completed scan."""
    user = get_current_user(session_cookie, authorization)
    require_scan_owner(scan_id, user["id"])

    findings = get_findings(scan_id)
    fail_checks = {
        f["check_id"].upper()
        for f in findings
        if f.get("status") == "FAIL" and f.get("resolution", "OPEN") == "OPEN"
    }

    # Per-framework: list passing and failing controls
    coverage: Dict[str, Any] = {}
    for fw_key, fw_info in FRAMEWORK_SUMMARIES.items():
        all_controls: Dict[str, str] = {}  # control_id → "PASS" | "FAIL"
        for check_id, mapping in COMPLIANCE_CONTROLS.items():
            for ctrl in mapping.get(fw_key, []):
                if ctrl not in all_controls:
                    all_controls[ctrl] = "PASS"
                if check_id in fail_checks:
                    all_controls[ctrl] = "FAIL"

        total = len(all_controls)
        passing = sum(1 for v in all_controls.values() if v == "PASS")
        coverage[fw_key] = {
            "framework": fw_info["name"],
            "total_controls": total,
            "passing": passing,
            "failing": total - passing,
            "pct": round(passing / total * 100) if total else 100,
            "controls": all_controls,
        }

    return {"scan_id": scan_id, "coverage": coverage}
