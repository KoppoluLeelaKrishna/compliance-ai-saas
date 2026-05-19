import boto3
from botocore.exceptions import ClientError


def run_check(region: str = "us-east-1"):
    # IAM is a global service — region param is accepted for API consistency but ignored
    iam = boto3.client("iam", region_name="us-east-1")
    findings = []

    try:
        paginator = iam.get_paginator("list_users")
        users = []
        for page in paginator.paginate():
            users.extend(page.get("Users", []))
    except ClientError as e:
        return [
            {
                "service": "IAM",
                "title": "IAM MFA check failed",
                "check_id": "IAM_MFA_CHECK_ERROR",
                "severity": "HIGH",
                "resource_id": "iam",
                "status": "FAIL",
                "evidence": {"error": str(e)},
            }
        ]

    # Check root account MFA via account summary
    try:
        summary = iam.get_account_summary().get("SummaryMap", {})
        root_mfa = summary.get("AccountMFAEnabled", 0)
        if not root_mfa:
            findings.append(
                {
                    "service": "IAM",
                    "title": "Root account MFA is not enabled",
                    "check_id": "IAM_ROOT_NO_MFA",
                    "severity": "CRITICAL",
                    "resource_id": "arn:aws:iam::root",
                    "status": "FAIL",
                    "evidence": {"AccountMFAEnabled": False},
                }
            )
    except ClientError:
        pass

    for user in users:
        username = user.get("UserName", "unknown")
        user_arn = user.get("Arn", username)

        try:
            mfa_devices = iam.list_mfa_devices(UserName=username).get("MFADevices", [])
            has_mfa = len(mfa_devices) > 0

            if not has_mfa:
                findings.append(
                    {
                        "service": "IAM",
                        "title": "IAM user has no MFA device",
                        "check_id": "IAM_USER_NO_MFA",
                        "severity": "HIGH",
                        "resource_id": user_arn,
                        "status": "FAIL",
                        "evidence": {"UserName": username, "MFADeviceCount": 0},
                    }
                )
            else:
                findings.append(
                    {
                        "service": "IAM",
                        "title": "IAM user has MFA enabled",
                        "check_id": "IAM_USER_MFA_ENABLED",
                        "severity": "INFO",
                        "resource_id": user_arn,
                        "status": "PASS",
                        "evidence": {
                            "UserName": username,
                            "MFADeviceCount": len(mfa_devices),
                        },
                    }
                )
        except ClientError as e:
            findings.append(
                {
                    "service": "IAM",
                    "title": "IAM MFA device check failed for user",
                    "check_id": "IAM_MFA_USER_ERROR",
                    "severity": "HIGH",
                    "resource_id": user_arn,
                    "status": "FAIL",
                    "evidence": {"UserName": username, "error": str(e)},
                }
            )

    return findings
