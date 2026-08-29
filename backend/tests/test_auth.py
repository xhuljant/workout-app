def test_register_login_refresh_me(client):
    r = client.post("/api/auth/register", json={
        "email": "Alice@Example.com", "display_name": "Alice", "password": "password123",
    })
    assert r.status_code == 201, r.text
    tokens = r.json()

    # /me works with the access token
    me = client.get("/api/auth/me", headers={"Authorization": "Bearer " + tokens["access_token"]})
    assert me.status_code == 200
    assert me.json()["email"] == "alice@example.com"      # stored lower-cased

    # login with the ORIGINAL (mixed-case) email still resolves the account
    r = client.post("/api/auth/login", json={"email": "alice@example.com", "password": "password123"})
    assert r.status_code == 200

    # refresh swaps for a fresh pair
    r = client.post("/api/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert r.status_code == 200
    assert "access_token" in r.json()


def test_wrong_password_is_401(client, make_user):
    make_user(email="bob@example.com", password="password123")
    r = client.post("/api/auth/login", json={"email": "bob@example.com", "password": "nope"})
    assert r.status_code == 401


def test_duplicate_email_is_409(client, make_user):
    make_user(email="dup@example.com")
    r = client.post("/api/auth/register", json={
        "email": "dup@example.com", "display_name": "X", "password": "password123",
    })
    assert r.status_code == 409


def test_protected_route_needs_token(client):
    assert client.get("/api/workouts").status_code == 403
