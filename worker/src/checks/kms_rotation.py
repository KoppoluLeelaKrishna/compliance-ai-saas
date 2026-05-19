import boto3
from botocore.exceptions import ClientError


def run_check(region: str = "us-east-1"):
    kms = boto3.client("kms", region_name=region)

    try:
        paginator = kms.get_paginator("list_keys")
        keys = []
        for page in paginator.paginate():
            keys.extend(page.get("Keys", []))
    except ClientError as e:
        return [
            {
                "service": "KMS",
                "title": "KMS check failed",
                "check_id": "KMS_CHECK_ERROR",
                "severity": "HIGH",
                "resource_id": region,
                "status": "FAIL",
                "evidence": {"error": str(e)},
            }
        ]

    if not keys:
        return []

    findings = []
    for key in keys:
        key_id = key.get("KeyId", "unknown")
        key_arn = key.get("KeyArn", key_id)

        try:
            metadata = kms.describe_key(KeyId=key_id).get("KeyMetadata", {})
            key_manager = metadata.get("KeyManager", "")
            key_state = metadata.get("KeyState", "")
            key_usage = metadata.get("KeyUsage", "")

            # Only check customer-managed keys that are enabled
            if key_manager != "CUSTOMER" or key_state != "Enabled":
                continue

            rotation = kms.get_key_rotation_status(KeyId=key_id)
            rotation_enabled = rotation.get("KeyRotationEnabled", False)

            if not rotation_enabled:
                findings.append(
                    {
                        "service": "KMS",
                        "title": "KMS key rotation not enabled",
                        "check_id": "KMS_KEY_ROTATION_DISABLED",
                        "severity": "MEDIUM",
                        "resource_id": key_arn,
                        "status": "FAIL",
                        "evidence": {
                            "KeyId": key_id,
                            "KeyManager": key_manager,
                            "KeyUsage": key_usage,
                            "KeyRotationEnabled": False,
                        },
                    }
                )
            else:
                findings.append(
                    {
                        "service": "KMS",
                        "title": "KMS key rotation enabled",
                        "check_id": "KMS_KEY_ROTATION_ENABLED",
                        "severity": "INFO",
                        "resource_id": key_arn,
                        "status": "PASS",
                        "evidence": {
                            "KeyId": key_id,
                            "KeyRotationEnabled": True,
                        },
                    }
                )
        except ClientError:
            continue

    return findings
