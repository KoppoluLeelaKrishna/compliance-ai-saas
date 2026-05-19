import boto3
from botocore.exceptions import ClientError


def run_check(region: str = "us-east-1"):
    client = boto3.client("cloudtrail", region_name=region)

    try:
        trails = client.describe_trails(includeShadowTrails=False).get("trailList", [])
    except ClientError as e:
        return [
            {
                "service": "CloudTrail",
                "title": "CloudTrail check failed",
                "check_id": "CLOUDTRAIL_CHECK_ERROR",
                "severity": "HIGH",
                "resource_id": region,
                "status": "FAIL",
                "evidence": {"error": str(e)},
            }
        ]

    if not trails:
        return [
            {
                "service": "CloudTrail",
                "title": "No CloudTrail trails configured",
                "check_id": "CLOUDTRAIL_NO_TRAIL",
                "severity": "CRITICAL",
                "resource_id": region,
                "status": "FAIL",
                "evidence": {"region": region, "trails_found": 0},
            }
        ]

    findings = []
    for trail in trails:
        trail_name = trail.get("Name", "unknown")
        trail_arn = trail.get("TrailARN", trail_name)
        is_multi_region = trail.get("IsMultiRegionTrail", False)
        log_validation = trail.get("LogFileValidationEnabled", False)

        try:
            status = client.get_trail_status(Name=trail_arn)
            is_logging = status.get("IsLogging", False)
        except ClientError as e:
            findings.append(
                {
                    "service": "CloudTrail",
                    "title": "CloudTrail status check failed",
                    "check_id": "CLOUDTRAIL_STATUS_ERROR",
                    "severity": "HIGH",
                    "resource_id": trail_arn,
                    "status": "FAIL",
                    "evidence": {"trail": trail_name, "error": str(e)},
                }
            )
            continue

        if not is_logging:
            findings.append(
                {
                    "service": "CloudTrail",
                    "title": "CloudTrail trail is not logging",
                    "check_id": "CLOUDTRAIL_NOT_LOGGING",
                    "severity": "CRITICAL",
                    "resource_id": trail_arn,
                    "status": "FAIL",
                    "evidence": {"trail": trail_name, "IsLogging": False},
                }
            )
        else:
            findings.append(
                {
                    "service": "CloudTrail",
                    "title": "CloudTrail trail is active",
                    "check_id": "CLOUDTRAIL_LOGGING_ENABLED",
                    "severity": "INFO",
                    "resource_id": trail_arn,
                    "status": "PASS",
                    "evidence": {
                        "trail": trail_name,
                        "IsLogging": True,
                        "IsMultiRegionTrail": is_multi_region,
                    },
                }
            )

        if not log_validation:
            findings.append(
                {
                    "service": "CloudTrail",
                    "title": "CloudTrail log file validation disabled",
                    "check_id": "CLOUDTRAIL_LOG_VALIDATION_DISABLED",
                    "severity": "MEDIUM",
                    "resource_id": trail_arn,
                    "status": "FAIL",
                    "evidence": {"trail": trail_name, "LogFileValidationEnabled": False},
                }
            )

        if not is_multi_region:
            findings.append(
                {
                    "service": "CloudTrail",
                    "title": "CloudTrail trail is not multi-region",
                    "check_id": "CLOUDTRAIL_NOT_MULTI_REGION",
                    "severity": "MEDIUM",
                    "resource_id": trail_arn,
                    "status": "FAIL",
                    "evidence": {"trail": trail_name, "IsMultiRegionTrail": False},
                }
            )

    return findings
