# Worker — Claude Code Guide

## Purpose
Runs AWS compliance checks using boto3. Called by the backend when a scan is triggered.

## Stack
Python 3.12 · boto3 · AWS STS (assume role) · SQLite/Postgres via shared db utils

## Structure
```
src/
  utils/
    db_sqlite.py    SQLite connection + helpers
    db_postgres.py  Postgres connection + helpers (used in production)
  s3_public.py            S3 public access check
  iam_admin_access.py     IAM over-permissioned roles check
  ec2_security_groups.py  Open security groups check
  ec2_ebs_encryption.py   EBS unencrypted volumes check
```

## Adding a New Compliance Check

1. Create `src/my_new_check.py`:
```python
import boto3

def run(session: boto3.Session, account_config: dict) -> list[dict]:
    """
    Returns list of findings. Each finding dict:
    {
        "service": "EC2",
        "severity": "HIGH",       # CRITICAL | HIGH | MEDIUM | LOW | INFO
        "check_id": "MY_CHECK_001",
        "title": "Human readable title",
        "resource_id": "resource-identifier",
        "status": "FAIL",         # FAIL | PASS
        "evidence": {},           # arbitrary dict with raw AWS data
    }
    """
    findings = []
    client = session.client("ec2", region_name=account_config["region"])
    # ... boto3 calls
    return findings
```

2. Register in the backend scan runner (search for where existing checks are imported in `main.py`)

## AWS Role Assumption
The backend uses STS to assume the customer's IAM role before running checks:
```python
sts = boto3.client("sts")
assumed = sts.assume_role(RoleArn=role_arn, RoleSessionName="vigilicloud-scan")
session = boto3.Session(
    aws_access_key_id=assumed["Credentials"]["AccessKeyId"],
    aws_secret_access_key=assumed["Credentials"]["SecretAccessKey"],
    aws_session_token=assumed["Credentials"]["SessionToken"],
)
```

## Future: Background Scheduling
Currently scans run synchronously on the HTTP request. When adding background workers:
- Consider Celery + Redis for task queue
- Or APScheduler for simple scheduled scans
- Store scan status in DB and poll from frontend

## Database Utilities
Both `db_sqlite.py` and `db_postgres.py` expose the same interface:
- `get_conn()` — returns a connection
- `add_scan()`, `add_finding()`, `update_scan_status()` — scan helpers
