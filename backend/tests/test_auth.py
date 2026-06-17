"""Tests for /auth/* endpoints."""
from __future__ import annotations

import uuid


def test_register_success(client):
    email = f"reg_{uuid.uuid4().hex[:8]}@example.com"
    resp = client.post("/auth/register", json={"email": email, "password": "pass1234", "name": "Alice"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["ok"] is True
    assert data["user"]["email"] == email
    assert data["user"]["role"] in ("user", "admin")


def test_register_duplicate_email(client):
    email = f"dup_{uuid.uuid4().hex[:8]}@example.com"
    client.post("/auth/register", json={"email": email, "password": "pass1234", "name": "Bob"})
    resp = client.post("/auth/register", json={"email": email, "password": "pass1234", "name": "Bob2"})
    assert resp.status_code == 409


def test_register_invalid_email(client):
    resp = client.post("/auth/register", json={"email": "not-an-email", "password": "pass1234", "name": "Charlie"})
    assert resp.status_code == 400


def test_register_short_password(client):
    email = f"short_{uuid.uuid4().hex[:8]}@example.com"
    resp = client.post("/auth/register", json={"email": email, "password": "abc", "name": "Dan"})
    assert resp.status_code == 400


def test_login_success(client, auth_headers):
    resp = client.post("/auth/login", json={
        "email": auth_headers["email"],
        "password": auth_headers["password"],
    })
    assert resp.status_code == 200
    assert resp.json()["ok"] is True


def test_login_wrong_password(client, auth_headers):
    resp = client.post("/auth/login", json={
        "email": auth_headers["email"],
        "password": "wrongpassword",
    })
    assert resp.status_code == 401


def test_login_unknown_email(client):
    resp = client.post("/auth/login", json={
        "email": "nobody@nowhere.com",
        "password": "pass1234",
    })
    assert resp.status_code == 401


def test_me_authenticated(client, auth_headers):
    resp = client.get("/auth/me", cookies=auth_headers["cookies"])
    assert resp.status_code == 200
    data = resp.json()
    assert data["authenticated"] is True
    assert data["user"]["email"] == auth_headers["email"]


def test_me_unauthenticated(client):
    resp = client.get("/auth/me")
    assert resp.status_code == 401


def test_logout(client, auth_headers):
    resp = client.post("/auth/logout", cookies=auth_headers["cookies"])
    assert resp.status_code == 200
    # After logout, /auth/me should fail
    resp2 = client.get("/auth/me", cookies=auth_headers["cookies"])
    assert resp2.status_code == 401
