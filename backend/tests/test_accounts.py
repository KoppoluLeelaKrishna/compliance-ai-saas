"""Tests for /accounts/* endpoints."""
from __future__ import annotations


VALID_ACCOUNT = {
    "customer_name": "Acme Corp",
    "account_name": "Production",
    "aws_account_id": "123456789012",
    "role_arn": "arn:aws:iam::123456789012:role/VigiliCloudAudit",
    "external_id": "ext-001",
    "region": "us-east-1",
    "is_active": True,
}


def test_list_accounts_empty(client, auth_headers):
    resp = client.get("/accounts", cookies=auth_headers["cookies"])
    assert resp.status_code == 200
    assert "accounts" in resp.json()


def test_create_account(client, auth_headers):
    resp = client.post("/accounts", json=VALID_ACCOUNT, cookies=auth_headers["cookies"])
    assert resp.status_code in (200, 201), resp.text
    data = resp.json()
    assert data.get("status") == "ok" or "account" in data


def test_create_account_invalid_arn(client, auth_headers):
    bad = dict(VALID_ACCOUNT)
    bad["role_arn"] = "not-an-arn"
    resp = client.post("/accounts", json=bad, cookies=auth_headers["cookies"])
    assert resp.status_code == 400


def test_create_account_invalid_account_id(client, auth_headers):
    bad = dict(VALID_ACCOUNT)
    bad["aws_account_id"] = "123"  # not 12 digits
    resp = client.post("/accounts", json=bad, cookies=auth_headers["cookies"])
    assert resp.status_code == 400


def test_unauthenticated_accounts(client):
    resp = client.get("/accounts")
    assert resp.status_code == 401


def test_create_and_list_account(client, auth_headers):
    client.post("/accounts", json=VALID_ACCOUNT, cookies=auth_headers["cookies"])
    resp = client.get("/accounts", cookies=auth_headers["cookies"])
    assert resp.status_code == 200
    accounts = resp.json().get("accounts", [])
    assert any(a.get("aws_account_id") == "123456789012" for a in accounts)
