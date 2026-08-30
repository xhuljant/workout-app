"""Password reset via the one-time recovery code (no email).

register returns a recovery_code; POST /reset-password takes
{email, recovery_code, new_password}, sets the password, and rotates the code
(the response carries the new one).
"""
import re
import time


def _register(client, email="reset@example.com", password="password123"):
    r = client.post("/api/auth/register", json={
        "email": email, "display_name": "Reset Tester", "password": password,
    })
    assert r.status_code == 201, r.text
    return r.json()   # {access_token, refresh_token, token_type, recovery_code}


def test_register_returns_a_recovery_code(client):
    body = _register(client)
    code = body["recovery_code"]
    # 32 hex chars grouped in 4s -> "xxxx-xxxx-xxxx-xxxx-xxxx-xxxx-xxxx-xxxx"
    assert re.fullmatch(r"([0-9a-f]{4}-){7}[0-9a-f]{4}", code), code


def test_reset_with_code_then_login_with_new_password(client):
    old = _register(client, "happy@example.com", "password123")

    r = client.post("/api/auth/reset-password", json={
        "email": "happy@example.com",
        "recovery_code": old["recovery_code"],
        "new_password": "brand-new-pw-9",
    })
    assert r.status_code == 200, r.text
    new_code = r.json()["recovery_code"]
    assert new_code and new_code != old["recovery_code"]

    assert client.post("/api/auth/login", json={
        "email": "happy@example.com", "password": "password123"}).status_code == 401
    assert client.post("/api/auth/login", json={
        "email": "happy@example.com", "password": "brand-new-pw-9"}).status_code == 200


def test_used_code_is_dead_returned_code_works(client):
    old = _register(client, "rotate@example.com", "password123")

    r1 = client.post("/api/auth/reset-password", json={
        "email": "rotate@example.com",
        "recovery_code": old["recovery_code"],
        "new_password": "first-new-pw-1",
    })
    assert r1.status_code == 200
    new_code = r1.json()["recovery_code"]

    # the original code no longer works
    assert client.post("/api/auth/reset-password", json={
        "email": "rotate@example.com",
        "recovery_code": old["recovery_code"],
        "new_password": "second-new-pw-2",
    }).status_code == 400

    # the code handed back by the first reset does
    assert client.post("/api/auth/reset-password", json={
        "email": "rotate@example.com",
        "recovery_code": new_code,
        "new_password": "second-new-pw-2",
    }).status_code == 200


def test_wrong_code_is_400_and_password_unchanged(client):
    _register(client, "wrong@example.com", "password123")

    r = client.post("/api/auth/reset-password", json={
        "email": "wrong@example.com",
        "recovery_code": "0000-0000-0000-0000-0000-0000-0000-0000",
        "new_password": "brand-new-pw-9",
    })
    assert r.status_code == 400
    assert r.json()["detail"] == "Email or recovery code is incorrect."
    assert client.post("/api/auth/login", json={
        "email": "wrong@example.com", "password": "password123"}).status_code == 200


def test_unknown_email_is_400(client):
    r = client.post("/api/auth/reset-password", json={
        "email": "nobody@example.com",
        "recovery_code": "0000-0000-0000-0000-0000-0000-0000-0000",
        "new_password": "brand-new-pw-9",
    })
    assert r.status_code == 400
    assert r.json()["detail"] == "Email or recovery code is incorrect."


def test_soft_deleted_user_cannot_reset(client):
    tokens = _register(client, "gone@example.com", "password123")
    d = client.delete("/api/auth/me",
                      headers={"Authorization": "Bearer " + tokens["access_token"]})
    assert d.status_code == 204

    r = client.post("/api/auth/reset-password", json={
        "email": "gone@example.com",
        "recovery_code": tokens["recovery_code"],
        "new_password": "brand-new-pw-9",
    })
    assert r.status_code == 400


def test_short_password_422_does_not_consume_code(client):
    old = _register(client, "short@example.com", "password123")

    assert client.post("/api/auth/reset-password", json={
        "email": "short@example.com",
        "recovery_code": old["recovery_code"],
        "new_password": "short",
    }).status_code == 422

    # same code still works with a valid password
    assert client.post("/api/auth/reset-password", json={
        "email": "short@example.com",
        "recovery_code": old["recovery_code"],
        "new_password": "long-enough-pw-1",
    }).status_code == 200


def test_code_is_format_and_case_insensitive(client):
    old = _register(client, "fmt@example.com", "password123")
    messy = "  " + old["recovery_code"].upper().replace("-", " ") + "  "

    r = client.post("/api/auth/reset-password", json={
        "email": "fmt@example.com",
        "recovery_code": messy,
        "new_password": "brand-new-pw-9",
    })
    assert r.status_code == 200


def test_reset_revokes_old_refresh_token(client):
    tokens = _register(client, "revoke@example.com", "password123")
    # password_changed_at is truncated to whole seconds (so is the token iat);
    # wait past the boundary so the old token's iat < password_changed_at.
    time.sleep(1.1)

    assert client.post("/api/auth/reset-password", json={
        "email": "revoke@example.com",
        "recovery_code": tokens["recovery_code"],
        "new_password": "brand-new-pw-9",
    }).status_code == 200

    r = client.post("/api/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert r.status_code == 401


def test_reset_revokes_old_access_token(client):
    tokens = _register(client, "revoke2@example.com", "password123")
    time.sleep(1.1)   # see test_reset_revokes_old_refresh_token

    assert client.post("/api/auth/reset-password", json={
        "email": "revoke2@example.com",
        "recovery_code": tokens["recovery_code"],
        "new_password": "brand-new-pw-9",
    }).status_code == 200

    r = client.get("/api/auth/me",
                   headers={"Authorization": "Bearer " + tokens["access_token"]})
    assert r.status_code == 401
