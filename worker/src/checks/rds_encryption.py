import boto3
from botocore.exceptions import ClientError


def run_check(region: str = "us-east-1"):
    client = boto3.client("rds", region_name=region)

    try:
        paginator = client.get_paginator("describe_db_instances")
        instances = []
        for page in paginator.paginate():
            instances.extend(page.get("DBInstances", []))
    except ClientError as e:
        return [
            {
                "service": "RDS",
                "title": "RDS encryption check failed",
                "check_id": "RDS_CHECK_ERROR",
                "severity": "HIGH",
                "resource_id": region,
                "status": "FAIL",
                "evidence": {"error": str(e)},
            }
        ]

    if not instances:
        return []

    findings = []
    for instance in instances:
        db_id = instance.get("DBInstanceIdentifier", "unknown")
        encrypted = instance.get("StorageEncrypted", False)
        engine = instance.get("Engine", "unknown")
        db_class = instance.get("DBInstanceClass", "unknown")
        publicly_accessible = instance.get("PubliclyAccessible", False)

        if not encrypted:
            findings.append(
                {
                    "service": "RDS",
                    "title": "RDS instance storage is not encrypted",
                    "check_id": "RDS_STORAGE_NOT_ENCRYPTED",
                    "severity": "HIGH",
                    "resource_id": f"rds:{db_id}",
                    "status": "FAIL",
                    "evidence": {
                        "DBInstanceIdentifier": db_id,
                        "Engine": engine,
                        "DBInstanceClass": db_class,
                        "StorageEncrypted": False,
                    },
                }
            )
        else:
            findings.append(
                {
                    "service": "RDS",
                    "title": "RDS instance storage is encrypted",
                    "check_id": "RDS_STORAGE_ENCRYPTED",
                    "severity": "INFO",
                    "resource_id": f"rds:{db_id}",
                    "status": "PASS",
                    "evidence": {
                        "DBInstanceIdentifier": db_id,
                        "Engine": engine,
                        "StorageEncrypted": True,
                    },
                }
            )

        if publicly_accessible:
            findings.append(
                {
                    "service": "RDS",
                    "title": "RDS instance is publicly accessible",
                    "check_id": "RDS_PUBLICLY_ACCESSIBLE",
                    "severity": "HIGH",
                    "resource_id": f"rds:{db_id}",
                    "status": "FAIL",
                    "evidence": {
                        "DBInstanceIdentifier": db_id,
                        "Engine": engine,
                        "PubliclyAccessible": True,
                    },
                }
            )

    return findings
