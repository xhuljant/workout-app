import argparse

import pytest

from app import admin_cli
from app.database import SessionLocal
from app.models import User


def _ns(**kwargs):
    return argparse.Namespace(**kwargs)


def test_reset_password_lets_the_user_log_in_with_the_new_password(client, headers, capsys):
    me = client.get("/api/auth/me", headers=headers).json()

    admin_cli.cmd_reset_password(_ns(email=me["email"], password="brand-new-pw"))
    capsys.readouterr()

    ok = client.post("/api/auth/login", json={"email": me["email"], "password": "brand-new-pw"})
    assert ok.status_code == 200

    old = client.post("/api/auth/login", json={"email": me["email"], "password": "password123"})
    assert old.status_code == 401


def test_reset_password_generates_one_when_omitted(client, headers, capsys):
    me = client.get("/api/auth/me", headers=headers).json()
    admin_cli.cmd_reset_password(_ns(email=me["email"], password=None))
    out = capsys.readouterr().out
    assert "Temporary password:" in out


def test_rename_user(client, headers, capsys):
    me = client.get("/api/auth/me", headers=headers).json()
    admin_cli.cmd_rename_user(_ns(email=me["email"], new_name="  New Name  "))
    capsys.readouterr()
    after = client.get("/api/auth/me", headers=headers).json()
    assert after["display_name"] == "New Name"


def test_clear_history_soft_deletes_workouts(client, headers, capsys):
    client.post("/api/workouts", headers=headers)
    client.post("/api/workouts/active/finish", headers=headers)
    assert len(client.get("/api/workouts", headers=headers).json()) == 1

    me = client.get("/api/auth/me", headers=headers).json()
    admin_cli.cmd_clear_history(_ns(email=me["email"], yes=True))
    capsys.readouterr()

    assert client.get("/api/workouts", headers=headers).json() == []
    trash = client.get("/api/workouts/trash", headers=headers).json()
    assert len(trash) == 1


def test_clear_history_noop_when_nothing_to_clear(client, headers, capsys):
    me = client.get("/api/auth/me", headers=headers).json()
    admin_cli.cmd_clear_history(_ns(email=me["email"], yes=True))
    out = capsys.readouterr().out
    assert "no workout history to clear" in out


def test_delete_account_matches_self_service_delete(client, headers, capsys):
    me = client.get("/api/auth/me", headers=headers).json()
    client.post("/api/routines", headers=headers, json={"name": "Push day", "content": {"exercises": []}})

    admin_cli.cmd_delete_account(_ns(email=me["email"], yes=True))
    capsys.readouterr()

    # The token is dead -- deps.get_current_user filters deleted_at IS NULL.
    assert client.get("/api/auth/me", headers=headers).status_code == 401

    db = SessionLocal()
    try:
        row = db.query(User).filter(User.id == me["id"]).first()
        assert row.deleted_at is not None
        assert row.email != me["email"]
        assert row.email.startswith(me["email"])
    finally:
        db.close()


def test_find_user_rejects_unknown_or_deleted_email(client, headers, capsys):
    with pytest.raises(SystemExit):
        admin_cli.cmd_rename_user(_ns(email="nobody@example.com", new_name="x"))
