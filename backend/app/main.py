"""FastAPI application entry point.

What this file does:
  - creates the FastAPI app
  - seeds the exercise library on startup
  - purges rows soft-deleted more than 30 days ago (Trash retention)
  - wires up the API routes
  - serves the static web UI

The database SCHEMA is managed by Alembic, not this file. `alembic upgrade head`
runs in entrypoint.sh before the server starts, so by the time `lifespan` runs
every table already exists and is current.

Run (inside the container) with:  uvicorn app.main:app --host 0.0.0.0 --port 8000
"""
import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text

from .database import SessionLocal
from . import models  # noqa: F401  -- importing this registers our tables on Base
from .push_sender import reminder_loop
from .routers import auth, exercises, workouts, routines, folders, measurements, data, push
from .seed import seed_exercises


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Runs once when the server starts. The schema is already migrated by now
    # (entrypoint.sh -> alembic upgrade head), so this only does data work.
    with SessionLocal() as db:
        # Load the public exercise library into the DB (only inserts what's missing).
        added = seed_exercises(db)
        if added:
            print(f"Seeded {added} exercises into the library.")

        # Trash retention: hard-delete workouts / measurements that have been
        # soft-deleted for more than 30 days. Bounded and cheap; runs once a boot.
        purged_w = db.execute(text(
            "DELETE FROM workouts "
            "WHERE deleted_at IS NOT NULL AND deleted_at < now() - interval '30 days'"
        )).rowcount
        purged_m = db.execute(text(
            "DELETE FROM measurement_entries "
            "WHERE deleted_at IS NOT NULL AND deleted_at < now() - interval '30 days'"
        )).rowcount
        if purged_w or purged_m:
            print(f"Purged {purged_w} workout(s) and {purged_m} measurement(s) from Trash.")

        db.commit()

    # Background sender for "rest timer done" Web Push notifications. It no-ops
    # internally when VAPID keys aren't configured, so it's always safe to start.
    reminder_task = asyncio.create_task(reminder_loop())

    yield

    reminder_task.cancel()
    try:
        await reminder_task
    except asyncio.CancelledError:
        pass


app = FastAPI(title="Workout App API", lifespan=lifespan)


@app.get("/api/health")
def health():
    """Liveness + DB round-trip, for the compose healthcheck and uptime probes."""
    with SessionLocal() as db:
        db.execute(text("SELECT 1"))
    return {"status": "ok"}


# Register the API routes FIRST so they take priority over the catch-all static
# mount below. e.g. a request to /api/auth/login matches this router, not a file.
app.include_router(auth.router)
app.include_router(exercises.router)
app.include_router(workouts.router)
app.include_router(routines.router)
app.include_router(folders.router)
app.include_router(measurements.router)
app.include_router(data.router)
app.include_router(push.router)

# Serve the login page and its CSS/JS. html=True makes a request to "/" return
# index.html. This mount is added LAST, so it only handles paths the API didn't.
# (Serving the front-end from the same server means no CORS to configure. When
# we later build the full PWA it will likely become its own service.)
app.mount("/", StaticFiles(directory="static", html=True), name="static")
