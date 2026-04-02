from __future__ import annotations

import json
import os
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Dict, List

PROJECT_ROOT = Path(__file__).resolve().parents[2]
REPO_ROOT = PROJECT_ROOT.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from worker.src.utils.db_sqlite import init_db, save_findings, save_scan  # noqa: E402


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _load_check(module_path: str) -> Callable[..., List[Dict[str, Any]]]:
    mod = __import__(module_path, fromlist=["*"])

    for fn_name in ("run_check", "run", "check", "scan"):
        fn = getattr(mod, fn_name, None)
        if callable(fn):
            return fn

    raise ImportError(
        f"No runnable function found in {module_path}. Expected run_check/run/check/scan."
    )


def run_scan(region: str = "us-east-1") -> Dict[str, Any]:
    init_db()

    scan_id = str(uuid.uuid4())
    save_scan(scan_id, "RUNNING")

    checks = [
        "worker.src.checks.s3_public",
        "worker.src.checks.iam_admin_access",
        "worker.src.checks.ec2_security_groups",
        "worker.src.checks.ec2_ebs_encryption",
    ]

    all_findings: List[Dict[str, Any]] = []

    for module_path in checks:
        try:
            fn = _load_check(module_path)
            findings = fn(region=region)
            if not isinstance(findings, list):
                raise TypeError(f"{module_path} returned non-list findings: {type(findings)}")

            for f in findings:
                if isinstance(f, dict) and "created_at" not in f:
                    f["created_at"] = _utc_now()

            all_findings.extend(findings)

        except Exception as e:
            all_findings.append(
                {
                    "service": "SYSTEM",
                    "title": "Check execution failed",
                    "check_id": f"CHECK_ERROR::{module_path}",
                    "severity": "HIGH",
                    "resource_id": module_path,
                    "status": "FAIL",
                    "evidence": {"error": str(e)},
                    "created_at": _utc_now(),
                }
            )

    save_findings(scan_id, all_findings)
    save_scan(scan_id, "COMPLETED")

    return {"scan_id": scan_id, "count": len(all_findings)}


if __name__ == "__main__":
    region = os.getenv("AWS_DEFAULT_REGION", "us-east-1")
    out = run_scan(region=region)
    print(json.dumps(out))