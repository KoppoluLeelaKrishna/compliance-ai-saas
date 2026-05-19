import boto3
from botocore.exceptions import ClientError


def run_check(region: str = "us-east-1"):
    ec2 = boto3.client("ec2", region_name=region)

    try:
        vpcs = ec2.describe_vpcs().get("Vpcs", [])
    except ClientError as e:
        return [
            {
                "service": "VPC",
                "title": "VPC flow logs check failed",
                "check_id": "VPC_FLOW_LOGS_CHECK_ERROR",
                "severity": "HIGH",
                "resource_id": region,
                "status": "FAIL",
                "evidence": {"error": str(e)},
            }
        ]

    if not vpcs:
        return []

    try:
        flow_logs = ec2.describe_flow_logs().get("FlowLogs", [])
        logged_vpcs = {fl.get("ResourceId") for fl in flow_logs if fl.get("FlowLogStatus") == "ACTIVE"}
    except ClientError:
        logged_vpcs = set()

    findings = []
    for vpc in vpcs:
        vpc_id = vpc.get("VpcId", "unknown")
        is_default = vpc.get("IsDefault", False)
        name = next(
            (t["Value"] for t in vpc.get("Tags", []) if t["Key"] == "Name"),
            vpc_id,
        )

        if vpc_id not in logged_vpcs:
            findings.append(
                {
                    "service": "VPC",
                    "title": "VPC flow logs not enabled",
                    "check_id": "VPC_FLOW_LOGS_DISABLED",
                    "severity": "MEDIUM",
                    "resource_id": vpc_id,
                    "status": "FAIL",
                    "evidence": {
                        "VpcId": vpc_id,
                        "Name": name,
                        "IsDefault": is_default,
                        "FlowLogsEnabled": False,
                    },
                }
            )
        else:
            findings.append(
                {
                    "service": "VPC",
                    "title": "VPC flow logs enabled",
                    "check_id": "VPC_FLOW_LOGS_ENABLED",
                    "severity": "INFO",
                    "resource_id": vpc_id,
                    "status": "PASS",
                    "evidence": {"VpcId": vpc_id, "Name": name, "FlowLogsEnabled": True},
                }
            )

    return findings
