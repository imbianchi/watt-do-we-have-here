"""Auth flow — register, login, protected access, token validation."""


async def test_register_returns_token(client):
    r = await client.post("/api/auth/register", json={
        "email": "alice@example.com", "password": "secret123", "name": "Alice",
    })
    assert r.status_code == 200
    body = r.json()
    assert "access_token" in body
    assert body["token_type"] == "bearer"


async def test_register_rejects_short_password(client):
    r = await client.post("/api/auth/register", json={
        "email": "bob@example.com", "password": "short", "name": "Bob",
    })
    assert r.status_code == 422


async def test_register_rejects_password_without_digit(client):
    r = await client.post("/api/auth/register", json={
        "email": "carol@example.com", "password": "alphabetic", "name": "Carol",
    })
    assert r.status_code == 422


async def test_register_rejects_duplicate_email(client):
    payload = {"email": "dup@example.com", "password": "test1234", "name": "X"}
    r1 = await client.post("/api/auth/register", json=payload)
    assert r1.status_code == 200
    r2 = await client.post("/api/auth/register", json=payload)
    assert r2.status_code == 400


async def test_login_with_valid_credentials(client):
    await client.post("/api/auth/register", json={
        "email": "dave@example.com", "password": "secret123", "name": "Dave",
    })
    r = await client.post("/api/auth/login", json={
        "email": "dave@example.com", "password": "secret123",
    })
    assert r.status_code == 200
    assert "access_token" in r.json()


async def test_login_with_wrong_password(client):
    await client.post("/api/auth/register", json={
        "email": "eve@example.com", "password": "secret123", "name": "Eve",
    })
    r = await client.post("/api/auth/login", json={
        "email": "eve@example.com", "password": "wrongpass",
    })
    assert r.status_code == 401


async def test_protected_endpoint_without_token(client):
    r = await client.get("/api/devices")
    assert r.status_code == 401


async def test_protected_endpoint_with_token(client, auth_headers):
    r = await client.get("/api/devices", headers=auth_headers)
    assert r.status_code == 200
    assert r.json() == []


async def test_me_returns_current_user(client, auth_headers):
    r = await client.get("/api/auth/me", headers=auth_headers)
    assert r.status_code == 200
    body = r.json()
    assert body["email"] == "user@example.com"
    assert body["name"] == "Test User"


async def test_invalid_token_rejected(client):
    r = await client.get("/api/auth/me", headers={"Authorization": "Bearer not-a-real-token"})
    assert r.status_code == 401
