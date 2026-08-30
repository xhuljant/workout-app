"""Shared test fixtures.

Runs against a REAL, throwaway Postgres (CI starts one as a service container;
locally, point DATABASE_URL at a scratch database -- never your real one). The
schema is built by running the Alembic migrations, so CI also proves the
migration chain applies cleanly.
"""
import os

# Defaults so `pytest` works out of the box against a local scratch DB. Set
# before importing the app -- settings/engine are created at import time.
os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+psycopg2://postgres:postgres@localhost:5432/workout_test",
)
os.environ.setdefault("JWT_SECRET", "test-secret-not-for-production-use")

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.database import engine, SessionLocal
from app.main import app
from app.seed import seed_exercises

_HERE = os.path.dirname(__file__)
_BACKEND = os.path.abspath(os.path.join(_HERE, ".."))

# FK-safe delete order. Not TRUNCATE ... CASCADE: that would also wipe the
# seeded exercise library (exercises.created_by references users).
_WIPE = [
    "DELETE FROM measurement_entries",
    "DELETE FROM workouts",
    "DELETE FROM routines",
    "DELETE FROM folders",
    "DELETE FROM password_resets",
    "DELETE FROM exercises WHERE is_custom = true OR created_by IS NOT NULL",
    "DELETE FROM users",
]


@pytest.fixture(scope="session", autouse=True)
def _schema():
    cfg = Config(os.path.join(_BACKEND, "alembic.ini"))
    cfg.set_main_option("script_location", os.path.join(_BACKEND, "alembic"))
    command.upgrade(cfg, "head")
    with SessionLocal() as db:
        seed_exercises(db)
    yield


@pytest.fixture(autouse=True)
def _clean():
    with engine.begin() as conn:
        for stmt in _WIPE:
            conn.execute(text(stmt))
    yield


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def make_user(client):
    """Returns a factory: make_user(email=...) -> Authorization headers dict."""
    def _make(email="t@example.com", password="password123", name="Tester"):
        r = client.post(
            "/api/auth/register",
            json={"email": email, "display_name": name, "password": password},
        )
        assert r.status_code == 201, r.text
        return {"Authorization": "Bearer " + r.json()["access_token"]}
    return _make


@pytest.fixture
def headers(make_user):
    return make_user()


@pytest.fixture
def a_weight_exercise(client, headers):
    """A seeded exercise id that tracks weight + reps."""
    r = client.get("/api/exercises", headers=headers)
    assert r.status_code == 200
    for ex in r.json():
        if ex["tracking_type"] == "weight_reps":
            return ex["id"]
    raise AssertionError("no weight_reps exercise in the seeded library")
