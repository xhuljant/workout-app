"""Progress-photo PIN: set / change / verify / remove, and the admin CLI."""
import argparse

import pytest

from app import admin_cli


def test_no_pin_by_default(client, headers):
    me = client.get("/api/auth/me", headers=headers).json()
    assert me["photo_pin_set"] is False


def test_set_pin_flips_the_flag_and_never_leaks_the_hash(client, headers):
    r = client.post("/api/auth/photo-pin", headers=headers, json={"new_pin": "1234"})
    assert r.status_code == 200, r.text
    assert r.json()["photo_pin_set"] is True

    me = client.get("/api/auth/me", headers=headers).json()
    assert me["photo_pin_set"] is True
    assert "photo_pin_hash" not in me

    export = client.get("/api/data/export", headers=headers).json()
    assert "photo_pin_hash" not in export["user"]
    assert "photo_pin_hash" not in str(export)


def test_verify_correct_and_incorrect(client, headers):
    client.post("/api/auth/photo-pin", headers=headers, json={"new_pin": "4321"})

    assert client.post(
        "/api/auth/photo-pin/verify", headers=headers, json={"pin": "4321"}
    ).status_code == 204
    assert client.post(
        "/api/auth/photo-pin/verify", headers=headers, json={"pin": "0000"}
    ).status_code == 400


def test_verify_400_when_no_pin_set(client, headers):
    assert client.post(
        "/api/auth/photo-pin/verify", headers=headers, json={"pin": "1234"}
    ).status_code == 400


def test_change_requires_current_pin_or_password(client, headers):
    client.post("/api/auth/photo-pin", headers=headers, json={"new_pin": "1111"})

    # No proof -> rejected, PIN unchanged.
    bad = client.post("/api/auth/photo-pin", headers=headers, json={"new_pin": "2222"})
    assert bad.status_code == 400
    assert client.post(
        "/api/auth/photo-pin/verify", headers=headers, json={"pin": "1111"}
    ).status_code == 204

    # Current PIN works.
    ok = client.post(
        "/api/auth/photo-pin",
        headers=headers,
        json={"new_pin": "2222", "current_pin": "1111"},
    )
    assert ok.status_code == 200

    # Account password works too.
    ok2 = client.post(
        "/api/auth/photo-pin",
        headers=headers,
        json={"new_pin": "3333", "password": "password123"},
    )
    assert ok2.status_code == 200


def test_remove_with_password_then_flag_is_false(client, headers):
    client.post("/api/auth/photo-pin", headers=headers, json={"new_pin": "9876"})

    bad = client.request(
        "DELETE", "/api/auth/photo-pin", headers=headers, json={"pin": "0000"}
    )
    assert bad.status_code == 400

    ok = client.request(
        "DELETE",
        "/api/auth/photo-pin",
        headers=headers,
        json={"password": "password123"},
    )
    assert ok.status_code == 204
    assert client.get("/api/auth/me", headers=headers).json()["photo_pin_set"] is False


@pytest.mark.parametrize("bad_pin", ["123", "123456789", "12a4", "", "  "])
def test_pin_format_is_enforced(client, headers, bad_pin):
    r = client.post("/api/auth/photo-pin", headers=headers, json={"new_pin": bad_pin})
    assert r.status_code == 422


def test_admin_cli_set_and_clear_photo_pin(client, headers, capsys):
    me = client.get("/api/auth/me", headers=headers).json()

    admin_cli.cmd_set_photo_pin(argparse.Namespace(email=me["email"], pin="2468"))
    capsys.readouterr()
    assert client.post(
        "/api/auth/photo-pin/verify", headers=headers, json={"pin": "2468"}
    ).status_code == 204

    admin_cli.cmd_clear_photo_pin(argparse.Namespace(email=me["email"]))
    capsys.readouterr()
    assert client.get("/api/auth/me", headers=headers).json()["photo_pin_set"] is False


def test_admin_cli_set_photo_pin_rejects_non_digits(client, headers):
    me = client.get("/api/auth/me", headers=headers).json()
    with pytest.raises(SystemExit):
        admin_cli.cmd_set_photo_pin(argparse.Namespace(email=me["email"], pin="abcd"))
