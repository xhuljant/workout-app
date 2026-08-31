"""Web Push endpoints.

These run with VAPID keys unset (the test env doesn't configure them), so
/vapid-key is 404 and /reminder is an accepted no-op. Subscribe / unsubscribe
still work -- they just store rows the (disabled) sender would use.
"""
import uuid

from app.database import SessionLocal
from app.models import PushReminder, PushSubscription


def _sub_body(endpoint=None):
    return {
        "endpoint": endpoint or f"https://push.example/{uuid.uuid4()}",
        "keys": {"p256dh": "BPExampleKeyMaterial", "auth": "authsecret"},
    }


def test_vapid_key_404_when_unconfigured(client, headers):
    r = client.get("/api/push/vapid-key", headers=headers)
    assert r.status_code == 404


def test_vapid_key_requires_auth(client):
    assert client.get("/api/push/vapid-key").status_code == 403


def test_subscribe_then_unsubscribe(client, headers):
    body = _sub_body()
    r = client.post("/api/push/subscribe", headers=headers, json=body)
    assert r.status_code == 204

    with SessionLocal() as db:
        rows = db.query(PushSubscription).filter_by(endpoint=body["endpoint"]).all()
        assert len(rows) == 1

    # Re-subscribing the same endpoint updates in place, no duplicate row.
    body["keys"]["auth"] = "rotated"
    assert client.post("/api/push/subscribe", headers=headers, json=body).status_code == 204
    with SessionLocal() as db:
        rows = db.query(PushSubscription).filter_by(endpoint=body["endpoint"]).all()
        assert len(rows) == 1 and rows[0].auth == "rotated"

    r = client.post("/api/push/unsubscribe", headers=headers, json={"endpoint": body["endpoint"]})
    assert r.status_code == 204
    with SessionLocal() as db:
        assert db.query(PushSubscription).filter_by(endpoint=body["endpoint"]).count() == 0


def test_reminder_is_noop_without_vapid_keys(client, headers):
    r = client.put(
        "/api/push/reminder",
        headers=headers,
        json={"fire_at": "2099-01-01T00:00:00+00:00"},
    )
    assert r.status_code == 204
    with SessionLocal() as db:
        assert db.query(PushReminder).count() == 0

    # DELETE is always safe, even with nothing armed.
    assert client.delete("/api/push/reminder", headers=headers).status_code == 204
