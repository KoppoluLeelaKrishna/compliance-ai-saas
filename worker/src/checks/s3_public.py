import json
import os

import boto3
from botocore.exceptions import ClientError

RISKY_PUBLIC_GRANTEES = {
    "http://acs.amazonaws.com/groups/global/AllUsers",
    "http://acs.amazonaws.com/groups/global/AuthenticatedUsers",
}


def is_acl_public(acl: dict) -> bool:
    for g in acl.get("Grants", []):
        grantee = g.get("Grantee", {})
        uri = grantee.get("URI")
        if uri in RISKY_PUBLIC_GRANTEES:
            return True
    return False


def safe_get(call, default=None):
    try:
        return call()
    except ClientError as e:
        code = e.response["Error"]["Code"]
        if code in (
            "NoSuchBucketPolicy",
            "NoSuchPublicAccessBlockConfiguration",
            "NoSuchWebsiteConfiguration",
        ):
            return default
        return {"_error": code, "_message": str(e)}


def _get_target_buckets(s3, override_name: str | None):
    if override_name:
        return [{"Name": override_name.strip()}]
    return s3.list_buckets().get("Buckets", [])


def scan_s3_public(region: str = "us-east-1"):
    s3 = boto3.client("s3", region_name=region)
    bucket_override = os.getenv("BUCKET_NAME", "").strip() or None

    buckets = _get_target_buckets(s3, bucket_override)
    findings = []

    for b in buckets:
        name = b["Name"]

        acl = safe_get(lambda: s3.get_bucket_acl(Bucket=name), default={})
        pab = safe_get(lambda: s3.get_public_access_block(Bucket=name), default={})
        pol = safe_get(lambda: s3.get_bucket_policy(Bucket=name), default=None)
        pol_status = safe_get(lambda: s3.get_bucket_policy_status(Bucket=name), default={})
        website = safe_get(lambda: s3.get_bucket_website(Bucket=name), default=None)

        pab_cfg = (pab or {}).get("PublicAccessBlockConfiguration", {})
        pab_bad = not (
            pab_cfg.get("BlockPublicAcls")
            and pab_cfg.get("IgnorePublicAcls")
            and pab_cfg.get("BlockPublicPolicy")
            and pab_cfg.get("RestrictPublicBuckets")
        )
        if pab_bad:
            findings.append(
                {
                    "service": "S3",
                    "title": "S3 Block Public Access is OFF",
                    "check_id": "S3_PUBLIC_ACCESS_BLOCK_OFF",
                    "severity": "CRITICAL",
                    "resource_id": f"s3://{name}",
                    "status": "FAIL",
                    "evidence": {"PublicAccessBlockConfiguration": pab_cfg},
                }
            )

        if acl and is_acl_public(acl):
            findings.append(
                {
                    "service": "S3",
                    "title": "S3 bucket ACL is public",
                    "check_id": "S3_BUCKET_ACL_PUBLIC",
                    "severity": "CRITICAL",
                    "resource_id": f"s3://{name}",
                    "status": "FAIL",
                    "evidence": {"acl": acl},
                }
            )

        if pol and isinstance(pol, dict) and "_error" not in pol:
            policy_doc = json.loads(pol.get("Policy", "{}"))
            findings.append(
                {
                    "service": "S3",
                    "title": "S3 bucket policy exists",
                    "check_id": "S3_BUCKET_POLICY_PRESENT",
                    "severity": "INFO",
                    "resource_id": f"s3://{name}",
                    "status": "PASS",
                    "evidence": {"policy": policy_doc},
                }
            )

        if pol_status and isinstance(pol_status, dict) and "_error" not in pol_status:
            is_public = pol_status.get("PolicyStatus", {}).get("IsPublic")
            if is_public is True:
                findings.append(
                    {
                        "service": "S3",
                        "title": "S3 bucket policy is public",
                        "check_id": "S3_BUCKET_POLICY_PUBLIC",
                        "severity": "CRITICAL",
                        "resource_id": f"s3://{name}",
                        "status": "FAIL",
                        "evidence": {"PolicyStatus": pol_status.get("PolicyStatus")},
                    }
                )

        if website and isinstance(website, dict) and "_error" not in website:
            findings.append(
                {
                    "service": "S3",
                    "title": "S3 website hosting enabled",
                    "check_id": "S3_WEBSITE_HOSTING_ENABLED",
                    "severity": "MEDIUM",
                    "resource_id": f"s3://{name}",
                    "status": "WARN",
                    "evidence": {"Website": website},
                }
            )

    return findings


def run_check(region: str = "us-east-1"):
    return scan_s3_public(region=region)