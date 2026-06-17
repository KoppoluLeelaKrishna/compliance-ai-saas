"""Tests for RBAC — viewer role enforcement and admin endpoints."""
from __future__ import annotations

import uuid


def _register_viewer(client):
    """Admin creates a viewer-role user and returns their creds."""
    email = f"viewer_{uuid.uuid4().hex[:8]}@example.com"
    password = "viewpass1"
    name = "Viewer User"

    admin = client.post("/auth/login", json={"email": "admin@compliance.local", "password": "admin123"})
    admin_cookies = dict(admin.cookies)

    # Invite viewer via admin endpoint
    invite_resp = client.post(
        "/admin/users/invite",
        json={"email": email, "password": password, "name": name, "role": "viewer"},
        cookies=admin_cookies,
    )
    assert invite_resp.status_code == 200, invite_resp.text

    login_resp = client.post("/auth/login", json={"email": email, "password": password})
    assert login_resp.status_code == 200
    return {"cookies": dict(login_resp.cookies), "email": email}


def test_admin_can_list_users(client, admin_headers):
    resp = client.get("/admin/users", cookies=admin_headers["cookies"])
    assert resp.status_code == 200
    assert "users" in resp.json()


def test_non_admin_cannot_list_users(client, auth_headers):
    resp = client.get("/admin/users", cookies=auth_headers["cookies"])
    assert resp.status_code == 403


def test_admin_can_change_role(client, admin_headers):
    email = f"target_{uuid.uuid4().hex[:8]}@example.com"
    reg = client.post("/auth/register", json={"email": email, "password": "pass1234", "name": "Target"})
    assert reg.status_code == 200, reg.text
    user_id = reg.json()["user"]["id"]

    resp = client.put(
        f"/admin/users/{user_id}/role",
        json={"role": "viewer"},
        cookies=admin_headers["cookies"],
    )
    assert resp.status_code == 200
    assert resp.json()["role"] == "viewer"


def test_viewer_cannot_run_scan(client):
    viewer = _register_viewer(client)
    resp = client.post("/scans/run", json={"region": "us-east-1"}, cookies=viewer["cookies"])
    assert resp.status_code == 403


def test_viewer_can_read_scans(client):
    viewer = _register_viewer(client)
    resp = client.get("/scans", cookies=viewer["cookies"])
    assert resp.status_code == 200


def test_invalid_role_rejected(client, admin_headers):
    email = f"bad_{uuid.uuid4().hex[:8]}@example.com"
    reg = client.post("/auth/register", json={"email": email, "password": "pass1234", "name": "Bad"})
    assert reg.status_code == 200, reg.text
    user_id = reg.json()["user"]["id"]
    resp = client.put(
        f"/admin/users/{user_id}/role",
        json={"role": "superuser"},
        cookies=admin_headers["cookies"],
    )
    assert resp.status_code == 400
