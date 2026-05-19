import boto3
from botocore.exceptions import ClientError


def run_check(region: str = "us-east-1"):
    iam = boto3.client("iam", region_name="us-east-1")

    try:
        summary = iam.get_account_summary().get("SummaryMap", {})
    except ClientError as e:
        return [
            {
                "service": "IAM",
                "title": "Root access key check failed",
                "check_id": "IAM_ROOT_ACCESS_KEY_CHECK_ERROR",
                "severity": "HIGH",
                "resource_id": "iam:root",
                "status": "FAIL",
                "evidence": {"error": str(e)},
            }
        ]

    root_keys = summary.get("AccountAccessKeysPresent", 0)

    if root_keys > 0:
        return [
            {
                "service": "IAM",
                "title": "Root account has active access keys",
                "check_id": "IAM_ROOT_ACCESS_KEY_ACTIVE",
                "severity": "CRITICAL",
                "resource_id": "arn:aws:iam::root",
                "status": "FAIL",
                "evidence": {
                    "AccountAccessKeysPresent": root_keys,
                    "risk": "Root access keys bypass all permission boundaries and should never exist.",
                },
            }
        ]

    return [
        {
            "service": "IAM",
            "title": "Root account has no access keys",
            "check_id": "IAM_ROOT_NO_ACCESS_KEYS",
            "severity": "INFO",
            "resource_id": "arn:aws:iam::root",
            "status": "PASS",
            "evidence": {"AccountAccessKeysPresent": 0},
        }
    ]
