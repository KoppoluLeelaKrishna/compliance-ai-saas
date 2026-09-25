"""Password hashing, change-password, and production default-admin hardening."""
from __future__ import annotations

import hashlib
import uuid

import pytest

from app import config
from app.deps import get_conn, hash_password, password_needs_rehash, verify_password


def _stored_hash(email: str) -> str:
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("SELECT password_hash FROM users WHERE lower(email) = lower(?)", (email,))
    row = cur.fetchone()
    conn.close()
    return row["password_hash"]


def _set_hash(email: str, password_hash: str) -> None:
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("UPDATE users SET password_hash = ? WHERE lower(email) = lower(?)", (password_hash, email))
    conn.commit()
    conn.close()


# ---------------------------------------------------------------------------
# Hashing
# ---------------------------------------------------------------------------

def test_hash_is_salted_scrypt():
    a, b = hash_password("correct horse"), hash_password("correct horse")
    assert a.startswith("scrypt$") and a != b
    assert verify_password("correct horse", a)
    assert not verify_password("wrong horse", a)
    assert not password_needs_rehash(a)


def test_empty_hash_never_verifies():
    assert not verify_password("", "")
    assert not verify_password("anything", "")


def test_malformed_scrypt_hash_is_rejected():
    assert not verify_password("x", "scrypt$not$a$valid$hash")


def test_legacy_sha256_login_upgrades_hash(client, auth_headers):
    email, password = auth_headers["email"], auth_headers["password"]
    _set_hash(email, hashlib.sha256(password.encode()).hexdigest())

    resp = client.post("/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200, resp.text

    upgraded = _stored_hash(email)
    assert upgraded.startswith("scrypt$")
    assert verify_password(password, upgraded)


# ---------------------------------------------------------------------------
# Change password
# ---------------------------------------------------------------------------

def test_change_password_success_revokes_other_sessions(client, auth_headers):
    email, old = auth_headers["email"], auth_headers["password"]
    other = client.post("/auth/login", json={"email": email, "password": old})
    other_cookies = dict(other.cookies)

    resp = client.post(
        "/auth/change-password",
        json={"current_password": old, "new_password": "a-much-better-pass"},
        cookies=auth_headers["cookies"],
    )
    assert resp.status_code == 200, resp.text

    assert client.post("/auth/login", json={"email": email, "password": old}).status_code == 401
    assert client.post("/auth/login", json={"email": email, "password": "a-much-better-pass"}).status_code == 200
    # The requesting session survives; the other one is signed out.
    assert client.get("/auth/me", cookies=auth_headers["cookies"]).status_code == 200
    assert client.get("/auth/me", cookies=other_cookies).status_code == 401


@pytest.mark.parametrize(
    "current, new, detail",
    [
        ("wrong-current", "a-much-better-pass", "Current password is incorrect"),
        (None, "seven77", "at least 8"),
        (None, None, "must differ"),
        (None, "admin123", "different password"),
    ],
)
def test_change_password_rejections(client, auth_headers, current, new, detail):
    current = current or auth_headers["password"]
    new = new or auth_headers["password"]
    resp = client.post(
        "/auth/change-password",
        json={"current_password": current, "new_password": new},
        cookies=auth_headers["cookies"],
    )
    assert resp.status_code == 400
    assert detail in resp.json()["detail"]


def test_change_password_requires_auth(client):
    resp = client.post("/auth/change-password", json={"current_password": "x" * 8, "new_password": "y" * 8})
    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# Production default-admin hardening
# ---------------------------------------------------------------------------

def test_production_refuses_dev_admin_password(client, monkeypatch):
    from app.routers import auth

    monkeypatch.setattr(auth, "IS_PRODUCTION", True)
    resp = client.post("/auth/login", json={"email": config.DEFAULT_ADMIN_EMAIL, "password": "admin123"})
    assert resp.status_code == 403
    assert "default password" in resp.json()["detail"]


def test_production_startup_rotates_dev_admin_password(client, monkeypatch):
    from app.main import ensure_auth_tables

    original = _stored_hash(config.DEFAULT_ADMIN_EMAIL)
    new_password = f"rotated-{uuid.uuid4().hex}"
    monkeypatch.setattr(config, "IS_PRODUCTION", True)
    monkeypatch.setattr(config, "DEFAULT_ADMIN_PASSWORD", new_password)
    try:
        ensure_auth_tables()
        rotated = _stored_hash(config.DEFAULT_ADMIN_EMAIL)
        assert verify_password(new_password, rotated)
        assert not verify_password("admin123", rotated)
    finally:
        _set_hash(config.DEFAULT_ADMIN_EMAIL, original)


def test_production_startup_without_admin_password_leaves_hash(client, monkeypatch):
    from app.main import ensure_auth_tables

    original = _stored_hash(config.DEFAULT_ADMIN_EMAIL)
    monkeypatch.setattr(config, "IS_PRODUCTION", True)
    monkeypatch.setattr(config, "DEFAULT_ADMIN_PASSWORD", "")
    ensure_auth_tables()
    # Not rotated (nothing to rotate to) — login refusal covers it instead.
    assert _stored_hash(config.DEFAULT_ADMIN_EMAIL) == original


# ---------------------------------------------------------------------------
# CORS
# ---------------------------------------------------------------------------

def test_legacy_render_frontend_not_in_cors_allowlist():
    assert "https://vigilicloud-ui.onrender.com" not in config.build_cors_origins()
    assert "https://app.vigilicloud.com" in config.build_cors_origins()
