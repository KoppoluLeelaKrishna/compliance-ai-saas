import boto3
from botocore.exceptions import ClientError


def _safe(call, default=None):
    try:
        return call()
    except ClientError as e:
        return {"_error": e.response["Error"]["Code"], "_message": str(e)}


def scan_ec2_ebs_encryption(region: str = "us-east-1") -> list[dict]:
    """
    Day 8 check: EBS encryption.
    - Checks account-level 'EBS encryption by default' setting.
    - Optionally checks volumes that are unencrypted.
    """
    ec2 = boto3.client("ec2", region_name=region)
    findings: list[dict] = []

    # 1) Account-level default encryption
    enc = _safe(lambda: ec2.get_ebs_encryption_by_default(), default={})
    if isinstance(enc, dict) and enc.get("_error"):
        # if AccessDenied etc, report a finding (still helpful)
        findings.append(
            {
                "service": "EC2",
                "title": "Cannot read EBS default encryption setting",
                "check_id": "EC2_EBS_DEFAULT_ENCRYPTION_READ_ERROR",
                "severity": "HIGH",
                "resource_id": f"ec2://account/{region}",
                "status": "FAIL",
                "evidence": enc,
            }
        )
        return findings

    enabled = bool(enc.get("EbsEncryptionByDefault", False))
    if not enabled:
        findings.append(
            {
                "service": "EC2",
                "title": "EBS encryption by default is DISABLED",
                "check_id": "EC2_EBS_DEFAULT_ENCRYPTION_OFF",
                "severity": "CRITICAL",
                "resource_id": f"ec2://account/{region}",
                "status": "FAIL",
                "evidence": {"EbsEncryptionByDefault": enabled},
            }
        )
    else:
        findings.append(
            {
                "service": "EC2",
                "title": "EBS encryption by default is ENABLED",
                "check_id": "EC2_EBS_DEFAULT_ENCRYPTION_ON",
                "severity": "INFO",
                "resource_id": f"ec2://account/{region}",
                "status": "PASS",
                "evidence": {"EbsEncryptionByDefault": enabled},
            }
        )

    # 2) Volume-level check (unencrypted volumes)
    vols = _safe(
        lambda: ec2.describe_volumes(Filters=[{"Name": "encrypted", "Values": ["false"]}]),
        default={},
    )
    if isinstance(vols, dict) and vols.get("_error"):
        # AccessDenied etc.
        findings.append(
            {
                "service": "EC2",
                "title": "Cannot list EBS volumes (unencrypted filter)",
                "check_id": "EC2_EBS_LIST_VOLUMES_ERROR",
                "severity": "MEDIUM",
                "resource_id": f"ec2://account/{region}",
                "status": "WARN",
                "evidence": vols,
            }
        )
        return findings

    unenc = vols.get("Volumes", []) if isinstance(vols, dict) else []
    for v in unenc:
        vid = v.get("VolumeId", "")
        az = v.get("AvailabilityZone", "")
        size = v.get("Size", "")
        vol_type = v.get("VolumeType", "")
        attachments = v.get("Attachments", []) or []

        findings.append(
            {
                "service": "EC2",
                "title": "Unencrypted EBS volume found",
                "check_id": "EC2_EBS_VOLUME_UNENCRYPTED",
                "severity": "HIGH",
                "resource_id": f"ec2://volume/{vid}",
                "status": "FAIL",
                "evidence": {
                    "volume_id": vid,
                    "availability_zone": az,
                    "size_gb": size,
                    "volume_type": vol_type,
                    "encrypted": v.get("Encrypted", False),
                    "attachments": attachments,
                },
            }
        )

    return findings


# ✅ runner.py expects this exact name in every check module
def run_check(region: str = "us-east-1") -> list[dict]:
    return scan_ec2_ebs_encryption(region=region)