"""Self-service password reset: forgot-password -> emailed link -> reset-password.

Uses a fake email sender (injected via app.dependency_overrides) so the test can
read the token straight out of the "sent" message. TestClient runs BackgroundTasks
before the request returns, so the outbox is populated by the time POST returns.
"""
import re
import time
from datetime import datetime, timedelta, timezone

import pytest

from app.main import app
from app.email import get_email_sender
from app.database import SessionLocal
from app.models import PasswordReset, User


class FakeEmailSender:
    def __init__(self):
        self.outbox = []

    def send(self, *, to, subject, body):
        self.outbox.append({"to": to, "subject": subject, "body": body})


@pytest.fixture
def fake_sender():
    s = FakeEmailSender()
    app.dependency_overrides[get_email_sender] = lambda: s
    yield s
    app.dependency_overrides.pop(get_email_sender, None)


def _token_from_outbox(sender):
    assert sender.outbox, "no email was sent"
    m = re.search(r"reset_token=([A-Za-z0-9_-]+)", sender.outbox[-1]["body"])
    assert m, sender.outbox[-1]["body"]
    return m.group(1)


def _register(client, email="reset@example.com", password="password123"):
    r = client.post("/api/auth/register", json={
        "email": email, "display_name": "Reset Tester", "password": password,
    })
    assert r.status_code == 201, r.text
    return r.json()   # {access_token, refresh_token, ...}


def test_forgot_then_reset_then_login(client, fake_sender):
    _register(client, "reset@example.com", "password123")

    r = client.post("/api/auth/forgot-password", json={"email": "reset@example.com"})
    assert r.status_code == 202
    assert len(fake_sender.outbox) == 1
    assert fake_sender.outbox[0]["to"] == "reset@example.com"

    token = _token_from_outbox(fake_sender)
    r = client.post("/api/auth/reset-password",
                    json={"token": token, "new_password": "brand-new-pw-9"})
    assert r.status_code == 204

    # old password no longer works, new one does
    assert client.post("/api/auth/login",
                       json={"email": "reset@example.com", "password": "password123"}).status_code == 401
    assert client.post("/api/auth/login",
                       json={"email": "reset@example.com", "password": "brand-new-pw-9"}).status_code == 200


def test_unknown_email_returns_202_and_sends_nothing(client, fake_sender):
    r = client.post("/api/auth/forgot-password", json={"email": "nobody@example.com"})
    assert r.status_code == 202
    assert fake_sender.outbox == []


def test_soft_deleted_user_gets_no_email(client, fake_sender):
    tokens = _register(client, "gone@example.com", "password123")
    d = client.delete("/api/auth/me",
                      headers={"Authorization": "Bearer " + tokens["access_token"]})
    assert d.status_code == 204

    r = client.post("/api/auth/forgot-password", json={"email": "gone@example.com"})
    assert r.status_code == 202
    assert fake_sender.outbox == []


def test_expired_token_is_rejected(client, fake_sender):
    _register(client, "exp@example.com", "password123")
    client.post("/api/auth/forgot-password", json={"email": "exp@example.com"})
    token = _token_from_outbox(fake_sender)

    with SessionLocal() as db:
        pr = (db.query(PasswordReset).join(User)
              .filter(User.email == "exp@example.com").one())
        pr.expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
        db.commit()

    r = client.post("/api/auth/reset-password",
                    json={"token": token, "new_password": "brand-new-pw-9"})
    assert r.status_code == 400
    # original password still valid
    assert client.post("/api/auth/login",
                       json={"email": "exp@example.com", "password": "password123"}).status_code == 200


def test_used_token_is_rejected_on_second_use(client, fake_sender):
    _register(client, "twice@example.com", "password123")
    client.post("/api/auth/forgot-password", json={"email": "twice@example.com"})
    token = _token_from_outbox(fake_sender)

    assert client.post("/api/auth/reset-password",
                       json={"token": token, "new_password": "first-new-pw-1"}).status_code == 204
    assert client.post("/api/auth/reset-password",
                       json={"token": token, "new_password": "second-new-pw-2"}).status_code == 400


def test_short_password_422_does_not_consume_token(client, fake_sender):
    _register(client, "short@example.com", "password123")
    client.post("/api/auth/forgot-password", json={"email": "short@example.com"})
    token = _token_from_outbox(fake_sender)

    assert client.post("/api/auth/reset-password",
                       json={"token": token, "new_password": "short"}).status_code == 422
    # same token still works with a valid password
    assert client.post("/api/auth/reset-password",
                       json={"token": token, "new_password": "long-enough-pw-1"}).status_code == 204


def test_second_forgot_invalidates_the_first_token(client, fake_sender):
    _register(client, "multi@example.com", "password123")

    client.post("/api/auth/forgot-password", json={"email": "multi@example.com"})
    token_a = _token_from_outbox(fake_sender)
    client.post("/api/auth/forgot-password", json={"email": "multi@example.com"})
    token_b = _token_from_outbox(fake_sender)
    assert token_a != token_b
    assert len(fake_sender.outbox) == 2

    assert client.post("/api/auth/reset-password",
                       json={"token": token_a, "new_password": "brand-new-pw-9"}).status_code == 400
    assert client.post("/api/auth/reset-password",
                       json={"token": token_b, "new_password": "brand-new-pw-9"}).status_code == 204


def test_reset_revokes_old_refresh_token(client, fake_sender):
    tokens = _register(client, "revoke@example.com", "password123")

    # password_changed_at is truncated to whole seconds (and so is the token's
    # iat), so a token minted in the same second as the reset is deliberately
    # still accepted. Wait past the second boundary so iat < password_changed_at.
    time.sleep(1.1)

    client.post("/api/auth/forgot-password", json={"email": "revoke@example.com"})
    token = _token_from_outbox(fake_sender)
    assert client.post("/api/auth/reset-password",
                       json={"token": token, "new_password": "brand-new-pw-9"}).status_code == 204

    r = client.post("/api/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert r.status_code == 401


def test_reset_revokes_old_access_token(client, fake_sender):
    tokens = _register(client, "revoke2@example.com", "password123")

    time.sleep(1.1)   # see note in test_reset_revokes_old_refresh_token

    client.post("/api/auth/forgot-password", json={"email": "revoke2@example.com"})
    token = _token_from_outbox(fake_sender)
    assert client.post("/api/auth/reset-password",
                       json={"token": token, "new_password": "brand-new-pw-9"}).status_code == 204

    r = client.get("/api/auth/me",
                   headers={"Authorization": "Bearer " + tokens["access_token"]})
    assert r.status_code == 401


def test_rate_limit_caps_active_reset_emails(client, fake_sender):
    _register(client, "flood@example.com", "password123")
    for _ in range(5):
        assert client.post("/api/auth/forgot-password",
                           json={"email": "flood@example.com"}).status_code == 202
    assert len(fake_sender.outbox) == 3
