"""
Shared pytest fixtures for VigiliCloud API tests.
Uses an in-memory SQLite database via monkeypatching to avoid touching the real DB.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

# Ensure the project root is on sys.path
PROJECT_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PROJECT_ROOT))

# Force SQLite test mode before importing the app
os.environ.setdefault("APP_ENV", "test")
os.environ.setdefault("DATABASE_URL", "")


@pytest.fixture(scope="function")
def client():
    """Return a fresh FastAPI TestClient per test (no shared cookie state)."""
    from app.main import app
    with TestClient(app, raise_server_exceptions=True) as c:
        yield c


@pytest.fixture
def auth_headers(client):
    """Register a fresh test user and return bearer-style session headers."""
    import uuid
    email = f"test_{uuid.uuid4().hex[:8]}@example.com"
    password = "testpass123"
    name = "Test User"

    resp = client.post("/auth/register", json={"email": email, "password": password, "name": name})
    assert resp.status_code == 200, resp.text

    # Extract the session cookie and return it as a dict for use with TestClient
    cookies = dict(resp.cookies)
    return {"cookies": cookies, "email": email, "password": password, "name": name}


@pytest.fixture
def admin_headers(client):
    """Login as the default seeded admin and return cookies."""
    resp = client.post("/auth/login", json={
        "email": "admin@compliance.local",
        "password": "admin123",
    })
    assert resp.status_code == 200, resp.text
    return {"cookies": dict(resp.cookies)}
