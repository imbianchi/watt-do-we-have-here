"""Shared test fixtures.

The env is set before any backend module is imported so the test DB URL
takes effect. Each test gets a fresh schema.
"""

import os
import sys
import uuid
from pathlib import Path

# Ensure the backend root is on sys.path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

# Configure env BEFORE importing any backend modules
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///:memory:")
os.environ.setdefault("SECRET_KEY", "test-secret-key-32-bytes-minimum-1234567890abcd")
os.environ.setdefault("ENCRYPTION_KEY", "test-encryption-key")
os.environ.setdefault("ENVIRONMENT", "test")
os.environ.setdefault("ALLOWED_ORIGINS", "http://localhost:5173")

import pytest_asyncio
from httpx import ASGITransport, AsyncClient


@pytest_asyncio.fixture
async def client(monkeypatch):
    # Use a unique on-disk SQLite DB per test so isolation is total.
    db_path = f"./test_{uuid.uuid4().hex}.db"
    db_url = f"sqlite+aiosqlite:///{db_path}"
    os.environ["DATABASE_URL"] = db_url

    # Force re-import of modules that captured DATABASE_URL at import time
    for mod in ("main", "database", "collector", "auth"):
        sys.modules.pop(mod, None)

    import collector  # noqa: WPS433
    import database  # noqa: WPS433
    import main  # noqa: WPS433

    # Stub Shelly network calls so tests don't need a real device
    async def fake_status(ip, password):
        return {"voltage": 230.0, "apower": 0.0, "current": 0.0, "output": False,
                "aenergy": {"total": 0}}
    async def fake_info(ip, password):
        return {"gen": 3, "model": "TestShelly", "ver": "1.0.0"}
    async def fake_uptime(ip, password):
        return 1234
    async def fake_switch_set(*args, **kwargs):
        return {}
    async def fake_rpc(*args, **kwargs):
        return {}

    monkeypatch.setattr(collector, "fetch_shelly_status", fake_status)
    monkeypatch.setattr(collector, "fetch_shelly_info", fake_info)
    monkeypatch.setattr(collector, "fetch_shelly_uptime", fake_uptime)
    monkeypatch.setattr(collector, "shelly_switch_set", fake_switch_set)
    monkeypatch.setattr(collector, "shelly_rpc", fake_rpc)
    monkeypatch.setattr(collector, "shelly_rpc_get", fake_rpc)
    monkeypatch.setattr(collector, "start_collector", lambda *a, **k: _noop())
    monkeypatch.setattr(collector, "start_device_thread", lambda *a, **k: None)

    await database.init_db()

    transport = ASGITransport(app=main.app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    if os.path.exists(db_path):
        os.remove(db_path)


async def _noop():
    return None


@pytest_asyncio.fixture
async def auth_token(client: AsyncClient) -> str:
    """Register a user and return their bearer token."""
    r = await client.post("/api/auth/register", json={
        "email": "user@example.com", "password": "test1234", "name": "Test User",
    })
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest_asyncio.fixture
async def auth_headers(auth_token: str) -> dict:
    return {"Authorization": f"Bearer {auth_token}"}
