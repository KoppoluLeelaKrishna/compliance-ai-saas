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


# ---------------------------------------------------------------------------
# GitHub OAuth — state cookie / callback host agreement
# ---------------------------------------------------------------------------
# The gh_oauth_state cookie is host-only. If the flow starts on one hostname
# and GitHub returns to another, the callback never receives the cookie and
# every sign-in fails as a state mismatch. Production hit exactly this:
# the UI called api.vigilicloud.com while GITHUB_CALLBACK_URL pointed at
# vigilicloud-api.onrender.com.


def test_github_start_bounces_to_callback_host(client, monkeypatch):
    """A start request on the wrong host redirects to the callback's host first."""
    import app.routers.auth as auth_mod

    monkeypatch.setattr(auth_mod, "GITHUB_CLIENT_ID", "cid")
    monkeypatch.setattr(auth_mod, "GITHUB_CLIENT_SECRET", "secret")
    monkeypatch.setattr(auth_mod, "GITHUB_CALLBACK_URL", "https://callback.example.com/auth/github/callback")

    resp = client.get("/auth/github", follow_redirects=False, headers={"host": "other.example.com"})
    assert resp.status_code in (302, 307)
    location = resp.headers["location"]
    assert location.startswith("https://callback.example.com/auth/github")
    # The cookie must NOT be set yet — setting it here is what the bug did.
    assert "gh_oauth_state" not in resp.headers.get("set-cookie", "")


def test_github_start_sets_state_on_matching_host(client, monkeypatch):
    """On the callback's own host it proceeds to GitHub and sets the state cookie."""
    import app.routers.auth as auth_mod

    monkeypatch.setattr(auth_mod, "GITHUB_CLIENT_ID", "cid")
    monkeypatch.setattr(auth_mod, "GITHUB_CLIENT_SECRET", "secret")
    monkeypatch.setattr(auth_mod, "GITHUB_CALLBACK_URL", "http://testserver/auth/github/callback")

    resp = client.get("/auth/github", follow_redirects=False)
    assert resp.status_code in (302, 307)
    assert resp.headers["location"].startswith("https://github.com/login/oauth/authorize")
    assert "gh_oauth_state" in resp.headers.get("set-cookie", "")


def test_github_callback_without_cookie_reports_missing_state(client, monkeypatch):
    """No cookie is reported distinctly from a wrong cookie, for diagnosability."""
    import app.routers.auth as auth_mod

    monkeypatch.setattr(auth_mod, "GITHUB_CLIENT_ID", "cid")
    monkeypatch.setattr(auth_mod, "GITHUB_CLIENT_SECRET", "secret")

    resp = client.get("/auth/github/callback?code=abc&state=xyz", follow_redirects=False)
    assert resp.status_code in (302, 307)
    assert "error=github_state_missing" in resp.headers["location"]


def test_github_callback_with_wrong_cookie_reports_mismatch(client, monkeypatch):
    import app.routers.auth as auth_mod

    monkeypatch.setattr(auth_mod, "GITHUB_CLIENT_ID", "cid")
    monkeypatch.setattr(auth_mod, "GITHUB_CLIENT_SECRET", "secret")

    resp = client.get(
        "/auth/github/callback?code=abc&state=xyz",
        cookies={"gh_oauth_state": "a-different-value"},
        follow_redirects=False,
    )
    assert resp.status_code in (302, 307)
    assert "error=github_state_mismatch" in resp.headers["location"]
