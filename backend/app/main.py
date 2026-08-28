"""FastAPI application entry point.

What this file does:
  - creates the FastAPI app
  - creates any missing database tables on startup
  - seeds the exercise library
  - wires up the auth + exercises routes
  - serves the static web UI

Run (inside the container) with:  uvicorn app.main:app --host 0.0.0.0 --port 8000
"""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text

from .database import Base, engine, SessionLocal
from . import models  # noqa: F401  -- importing this registers our tables on Base
from .routers import auth, exercises, workouts, routines, folders
from .seed import seed_exercises


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Runs once when the server starts. create_all creates any tables that don't
    # exist yet. IMPORTANT: it does NOT change existing tables -- so once the
    # schema starts changing between milestones we'll switch to real migrations
    # (Alembic). For now this keeps milestone 1 simple.
    Base.metadata.create_all(bind=engine)

    with SessionLocal() as db:
        # Load the public exercise library into the DB (only inserts what's missing).
        added = seed_exercises(db)
        if added:
            print(f"Seeded {added} exercises into the library.")

        # One-time fixup: emails are now stored lower-cased.
        db.execute(text("UPDATE users SET email = lower(email) WHERE email <> lower(email)"))
        db.commit()

    yield
    # (nothing to clean up on shutdown yet)


app = FastAPI(title="Workout App API", lifespan=lifespan)

# Register the API routes FIRST so they take priority over the catch-all static
# mount below. e.g. a request to /api/auth/login matches this router, not a file.
app.include_router(auth.router)
app.include_router(exercises.router)
app.include_router(workouts.router)
app.include_router(routines.router)
app.include_router(folders.router)

# Serve the login page and its CSS/JS. html=True makes a request to "/" return
# index.html. This mount is added LAST, so it only handles paths the API didn't.
# (Serving the front-end from the same server means no CORS to configure. When
# we later build the full PWA it will likely become its own service.)
app.mount("/", StaticFiles(directory="static", html=True), name="static")
