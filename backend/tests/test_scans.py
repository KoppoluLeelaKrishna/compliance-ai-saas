"""Tests for /scans/*, /findings endpoints."""
from __future__ import annotations

import uuid
from unittest.mock import patch


def _mock_subprocess_run(scan_id):
    """Return a mock subprocess.CompletedProcess that looks like a successful scan."""
    import subprocess
    mock = subprocess.CompletedProcess(
        args=[],
        returncode=0,
        stdout=f'{{"scan_id": "{scan_id}", "count": 2}}',
        stderr="",
    )
    return mock


def test_run_scan_returns_scan_id(client, auth_headers):
    """POST /scans/run should return a scan_id immediately (async)."""
    resp = client.post("/scans/run", json={"region": "us-east-1"}, cookies=auth_headers["cookies"])
    assert resp.status_code == 200
    data = resp.json()
    assert "scan_id" in data
    assert len(data["scan_id"]) == 36  # UUID format


def test_run_scan_invalid_region(client, auth_headers):
    resp = client.post("/scans/run", json={"region": "not-a-region"}, cookies=auth_headers["cookies"])
    assert resp.status_code == 400


def test_run_scan_unauthenticated(client):
    resp = client.post("/scans/run", json={"region": "us-east-1"})
    assert resp.status_code == 401


def test_list_scans(client, auth_headers):
    resp = client.get("/scans", cookies=auth_headers["cookies"])
    assert resp.status_code == 200
    assert "scans" in resp.json()


def test_scan_status_endpoint(client, auth_headers):
    resp = client.post("/scans/run", json={"region": "us-east-1"}, cookies=auth_headers["cookies"])
    scan_id = resp.json()["scan_id"]

    status_resp = client.get(f"/scans/{scan_id}/status", cookies=auth_headers["cookies"])
    assert status_resp.status_code == 200
    data = status_resp.json()
    assert data["scan_id"] == scan_id
    assert data["status"] in ("PENDING", "RUNNING", "COMPLETED", "FAILED")


def test_scan_not_found(client, auth_headers):
    fake_id = str(uuid.uuid4())
    resp = client.get(f"/scans/{fake_id}", cookies=auth_headers["cookies"])
    assert resp.status_code == 404


def test_findings_unauthenticated(client):
    resp = client.get("/findings")
    assert resp.status_code == 401


def test_compliance_mappings(client, auth_headers):
    resp = client.get("/compliance/mappings", cookies=auth_headers["cookies"])
    assert resp.status_code == 200
    data = resp.json()
    assert "mappings" in data
    assert "frameworks" in data
    assert "soc2" in data["frameworks"]


def test_compliance_mapping_for_check(client, auth_headers):
    resp = client.get("/compliance/mappings/S3_PUBLIC_ACCESS_BLOCK_OFF", cookies=auth_headers["cookies"])
    assert resp.status_code == 200
    data = resp.json()
    assert data["mapped"] is True
    assert "soc2" in data["controls"]


def test_compliance_mapping_for_unknown_check(client, auth_headers):
    resp = client.get("/compliance/mappings/NOT_A_REAL_CHECK", cookies=auth_headers["cookies"])
    assert resp.status_code == 200
    data = resp.json()
    assert data["mapped"] is False
    assert data["controls"] == {}


def test_findings_counts_only_latest_scan_per_account(client, auth_headers):
    """Re-scanning an account must not repeat its findings on /findings.

    /findings used to merge the 20 most recent scans, so one open S3 finding
    scanned three times showed up three times — the Findings page reported
    many times the open count the dashboard did.
    """
    from worker.src.utils import db_sqlite as db

    cookies = auth_headers["cookies"]
    user_id = client.get("/auth/me", cookies=cookies).json()["user"]["id"]
    account_id = db.create_connected_account(
        user_id, "Acme", "prod", "123456789012", "arn:aws:iam::123456789012:role/x"
    )
    account = db.get_connected_account(account_id, user_id=user_id)

    finding = {"service": "S3", "severity": "CRITICAL", "check_id": "S3_PUBLIC",
               "title": "Public bucket", "resource_id": "s3://bucket", "status": "FAIL"}
    scan_ids = []
    for day in (1, 2, 3):
        scan_id = str(uuid.uuid4())
        db.save_scan(scan_id, "COMPLETED")
        db.update_scan_user_id(scan_id, user_id)
        conn = db.get_conn()
        conn.execute("UPDATE scans SET created_at = ? WHERE scan_id = ?", (f"2026-01-0{day}T00:00:00+00:00", scan_id))
        conn.commit()
        conn.close()
        db.save_scan_account_link(scan_id, account)
        db.save_findings(scan_id, [finding])
        scan_ids.append(scan_id)

    resp = client.get("/findings", cookies=cookies)
    assert resp.status_code == 200, resp.text
    rows = [f for f in resp.json()["findings"] if f["account_id"] == account_id]
    assert len(rows) == 1
    assert rows[0]["scan_id"] == scan_ids[-1]

    dash = client.get("/dashboard", cookies=cookies).json()
    assert dash["totals"]["critical"] == len([r for r in resp.json()["findings"]
                                              if r["status"] == "FAIL" and r["severity"] == "CRITICAL"])


def test_dashboard_totals_exclude_resolved_and_findings_skip_unlinked(client, auth_headers):
    """Open counts drop a failure once it is marked Fixed or Ignored, and
    /findings leaves out scans with no connected account (as /dashboard does)."""
    from worker.src.utils import db_sqlite as db

    cookies = auth_headers["cookies"]
    user_id = client.get("/auth/me", cookies=cookies).json()["user"]["id"]
    account_id = db.create_connected_account(
        user_id, "Acme", "prod", "210987654321", "arn:aws:iam::210987654321:role/x"
    )
    account = db.get_connected_account(account_id, user_id=user_id)

    scan_id = str(uuid.uuid4())
    db.save_scan(scan_id, "COMPLETED")
    db.update_scan_user_id(scan_id, user_id)
    db.save_scan_account_link(scan_id, account)
    db.save_findings(scan_id, [
        {"service": "S3", "severity": "CRITICAL", "check_id": "S3_A", "title": "a", "resource_id": "r1", "status": "FAIL"},
        {"service": "S3", "severity": "CRITICAL", "check_id": "S3_B", "title": "b", "resource_id": "r2", "status": "FAIL"},
    ])

    orphan = str(uuid.uuid4())  # a scan with no account link
    db.save_scan(orphan, "COMPLETED")
    db.update_scan_user_id(orphan, user_id)
    db.save_findings(orphan, [
        {"service": "IAM", "severity": "HIGH", "check_id": "ORPHAN", "title": "o", "resource_id": "r3", "status": "FAIL"},
    ])

    assert client.get("/dashboard", cookies=cookies).json()["totals"]["critical"] == 2

    resp = client.post(f"/finding-actions/{scan_id}/S3_A", params={"resource_id": "r1"},
                       json={"action": "IGNORED", "note": "accepted risk"}, cookies=cookies)
    assert resp.status_code == 200, resp.text
    assert client.get("/dashboard", cookies=cookies).json()["totals"]["critical"] == 1

    rows = client.get("/findings", cookies=cookies).json()["findings"]
    assert {r["check_id"] for r in rows} == {"S3_A", "S3_B"}
    assert next(r for r in rows if r["check_id"] == "S3_A")["resolution"] == "IGNORED"
