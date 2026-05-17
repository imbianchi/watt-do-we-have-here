"""Device CRUD + tenant isolation between users."""


async def _register(client, email: str) -> dict:
    r = await client.post("/api/auth/register", json={
        "email": email, "password": "test1234", "name": email.split("@")[0],
    })
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


async def test_create_and_list_device(client, auth_headers):
    r = await client.post("/api/devices", json={
        "name": "Termoacumulador", "ip": "192.168.1.50", "password": None,
        "icon": "thermometer",
    }, headers=auth_headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["name"] == "Termoacumulador"
    assert body["ip"] == "192.168.1.50"
    assert body["shelly_gen"] == 3  # set by test fixture's fake_info

    listed = (await client.get("/api/devices", headers=auth_headers)).json()
    assert len(listed) == 1
    assert listed[0]["id"] == body["id"]


async def test_invalid_ip_rejected(client, auth_headers):
    r = await client.post("/api/devices", json={
        "name": "Bad", "ip": "not.an.ip.addr",
    }, headers=auth_headers)
    assert r.status_code == 422


async def test_users_cannot_see_each_others_devices(client):
    alice = await _register(client, "alice@example.com")
    bob = await _register(client, "bob@example.com")

    r = await client.post("/api/devices", json={
        "name": "Alice device", "ip": "10.0.0.1",
    }, headers=alice)
    assert r.status_code == 200
    alice_device_id = r.json()["id"]

    # Bob's list should be empty
    listed = (await client.get("/api/devices", headers=bob)).json()
    assert listed == []

    # Bob cannot read Alice's device
    r = await client.get(f"/api/devices/{alice_device_id}/status", headers=bob)
    assert r.status_code == 403

    # Bob cannot delete Alice's device
    r = await client.delete(f"/api/devices/{alice_device_id}", headers=bob)
    assert r.status_code == 403

    # Alice can still see her device
    r = await client.get(f"/api/devices/{alice_device_id}/info", headers=alice)
    assert r.status_code == 200


async def test_unauthorized_create_device(client):
    r = await client.post("/api/devices", json={
        "name": "X", "ip": "10.0.0.1",
    })
    assert r.status_code == 401


async def test_password_stored_encrypted(client, auth_headers):
    r = await client.post("/api/devices", json={
        "name": "WithPass", "ip": "10.0.0.2", "password": "supersecret",
    }, headers=auth_headers)
    assert r.status_code == 200
    # The response does NOT include the password field
    assert "password" not in r.json()

    # Verify the DB-side value is encrypted (not plaintext)
    import database
    devs = await database.get_devices(user_id=1)
    stored = devs[0].get("password")
    assert stored != "supersecret"
    # Verify it can be decrypted back
    import encryption
    assert encryption.decrypt_password(stored) == "supersecret"
