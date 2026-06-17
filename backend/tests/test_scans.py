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
    resp = client.get("/compliance/mappings/S3_PUBLIC_ACCESS_001", cookies=auth_headers["cookies"])
    assert resp.status_code == 200
    data = resp.json()
    assert data["mapped"] is True
    assert "soc2" in data["controls"]
