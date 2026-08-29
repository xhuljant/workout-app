# Workout App

A self-hosted workout tracker. Built piece by piece.

**Milestone 1: accounts + login.** A FastAPI backend with a Postgres database and
a login/register screen, so we can confirm the whole login round-trip works
before adding anything else.

**Milestone 2: the exercise library.** After login you land on a home screen.
From there, **Exercises** opens a searchable library that is seeded on startup
from the public **free-exercise-db** (800+ exercises). Any user can add a custom
exercise, and because the library is one shared table it shows up for everyone.

**Milestone 3 (this build): live workouts.** **Start empty workout** opens a
session screen with a running duration timer, live volume / set totals, and a
block per exercise with an editable sets table (LBS / REPS / done). Add exercises
from the library. The in-progress workout is saved to the backend on every edit,
so it resumes after a reload, a closed tab, or on another device. **Finish**
records it (`status = finished`) as history; **Discard Workout** throws it away.

---

## What's inside

```
workout-app/
├── docker-compose.yml      # runs Postgres + the API together
├── .env.example            # copy to .env and fill in your values
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt    # Python dependencies
│   ├── app/
│   │   ├── config.py       # settings read from environment variables
│   │   ├── database.py     # database connection + session handling
│   │   ├── models.py       # the `users`, `exercises`, `workouts` tables
│   │   ├── schemas.py      # request/response shapes (validation)
│   │   ├── security.py     # argon2 password hashing + JWT tokens
│   │   ├── deps.py         # get_current_user (protects private routes)
│   │   ├── seed.py         # loads the exercise library on startup
│   │   ├── main.py         # app startup + wiring
│   │   ├── data/
│   │   │   └── exercises.json   # vendored free-exercise-db snapshot (public domain)
│   │   └── routers/
│   │       ├── auth.py     # /register, /login, /refresh, /me
│   │       ├── exercises.py    # GET/POST /api/exercises
│   │       └── workouts.py     # start / resume / edit / finish / discard a workout
│   └── static/             # the web UI (served by the API for now)
│       ├── index.html
│       ├── style.css
│       └── app.js
```

Every Python file is heavily commented so you can read and change it.

---

## Prerequisites

- **Docker Desktop** (includes `docker compose`). That's all you need — Python and
  Postgres run inside the containers, so you don't have to install them yourself.

---

## Run it

1. Create your config file and edit the values (especially the secrets):

   ```bash
   cp .env.example .env
   ```

   Generate a good `JWT_SECRET` with:

   ```bash
   python -c "import secrets; print(secrets.token_urlsafe(64))"
   ```

   (No Python installed? Any long random string works for local testing.)

2. Build and start everything:

   ```bash
   docker compose up --build
   ```

   The first run downloads images and installs dependencies, so give it a minute.

3. Open **http://localhost:8000** in your browser.

To stop: press `Ctrl-C`, then `docker compose down`.

> **Do not run `docker compose down -v`.** The `-v` flag deletes the database
> volume — every account, workout, and measurement. Schema changes are handled
> by migrations now (see below), so you never need it. If you truly mean to wipe
> and start over, run `make backup` first.

---

## Reliability & operations

### Schema migrations (Alembic)

The database schema is versioned in `backend/alembic/versions/`. On every
`docker compose up`, the api container runs `alembic upgrade head` before
starting (see `backend/entrypoint.sh`), so a fresh database is built from the
migrations and an existing one is brought up to date automatically. Adding a
column no longer means wiping data.

- **Fresh install:** nothing to do — `up` creates everything.
- **Existing database from before migrations existed:** run this once so Alembic
  records the current schema as the baseline, then let it upgrade:

  ```bash
  docker compose run --rm --entrypoint "" api alembic stamp 0001
  docker compose up --build
  ```

- **Add a migration** after changing `models.py`:

  ```bash
  make revision M="add whatever column"
  # review the generated file in backend/alembic/versions/, then:
  make migrate
  ```

### Backups

An automatic `db-backup` container runs `pg_dump` once a day into `./backups/`
(kept 14 days). Take an immediate one before anything risky:

```bash
make backup
```

Restore from a dump (this replaces current data; it stops the api first):

```bash
make restore FILE=backups/workout-2026-08-28-1200.dump
```

Keep a copy of `.env` somewhere safe too — losing `JWT_SECRET` doesn't lose data
but logs everyone out.

### Upgrading Postgres

The image is pinned (`postgres:16.6`). Patch bumps within 16.x are drop-in. A
**major** bump (17, 18, …) is **not** — the on-disk data format changes. To do it:
`make backup`, change the tag, `docker compose down`, delete the volume, `up`,
then `make restore FILE=…`.

### Tests

```bash
cd backend
pip install -r requirements.txt -r requirements-dev.txt
DATABASE_URL=postgresql+psycopg2://postgres:postgres@localhost:5432/workout_test \
  JWT_SECRET=test python -m pytest
```

CI (`.github/workflows/ci.yml`) runs the suite against a throwaway Postgres,
applies the migrations, byte-compiles the backend, and syntax-checks `app.js` on
every push.

---

## Test that it works

1. Click **Create account**, enter a name, email, and a password (8+ characters),
   and submit. You should land on **"Signed in as ..."**.
2. Refresh the page — you should stay signed in (the token was saved).
3. Click **Log out**, then **Log in** with the same email and password.
4. Try logging in with a wrong password — you should see *"Incorrect email or
   password."*

### Exercises (milestone 2)

1. After logging in you land on the home screen. Click **Exercises**.
2. The list fills with the seeded library. Type in the search box to filter by
   name (e.g. `squat`).
3. Expand **Add an exercise**, enter a name (the other fields are optional), and
   submit. The list refreshes with your new exercise, tagged **custom**.
4. Log in as a different account and open **Exercises** — the custom exercise is
   there too, because the library is shared.

### Workouts (milestone 3)

1. On the home screen click **Start empty workout**. The workout screen opens and
   **Duration** starts counting up.
2. Tap **+ Add Exercise**, search the library, and pick one. It appears with a
   single empty set row.
3. Type a weight and reps, then tick the ✓ — **Volume** and **Sets** update. Add
   more sets with **+ Add Set**; jot something in the notes box.
4. Reload the page. The workout comes back exactly as you left it, and Duration
   keeps counting from the real start time. (Open a different browser, log in as
   the same user, and **Resume workout** shows the same session.)
5. **Finish** returns you home. **Discard Workout** (after a confirm) throws the
   session away instead.

To confirm a finished workout landed in Postgres:

```bash
docker compose exec db psql -U workout -d workout -c "select status, started_at, finished_at, jsonb_array_length(content->'exercises') as exercises from workouts;"
```

You can also poke the API directly through its auto-generated docs at
**http://localhost:8000/docs**.

To confirm the library landed in Postgres:

```bash
docker compose exec db psql -U workout -d workout -c "select count(*), bool_or(is_custom) from exercises;"
```

To confirm the data really landed in Postgres:

```bash
docker compose exec db psql -U workout -d workout -c "select email, display_name, created_at from users;"
```

(Use whatever `POSTGRES_USER` / `POSTGRES_DB` you set in `.env`.)

---

## Notes on a few decisions (so nothing is a surprise later)

- **Front-end is served by the API** for now, which avoids CORS while we're small.
  When we build the full app UI (a PWA), it will likely become its own service.
- **Schema changes are Alembic migrations**, applied automatically on startup by
  `entrypoint.sh`. See "Reliability & operations" above.
- **Tokens live in `localStorage`** for now — convenient and fine on your private
  network. We can harden this (httpOnly refresh cookie) before wider exposure.
- **Sync-friendly columns** (`updated_at`, `deleted_at`, UUID ids) are on every
  table (`users`, `exercises`, `workouts`); the actual sync endpoint comes later,
  once the basics exist.
- **A workout's contents live in one JSONB `content` blob**, not child tables.
  The client re-saves the whole workout on every edit during a session — a blob
  makes that one small write instead of many set-row upserts, and the data is
  tiny. A partial unique index enforces at most one `active` workout per user.
- **The in-progress workout is server-side state.** Every edit `PUT`s to
  `/api/workouts/active`, so closing the tab or switching devices loses nothing.
  `Finish` just flips `status` to `finished`; the row stays as history.
- **The exercise library is one shared table**, not per-user. A custom exercise
  one person adds is visible to everyone. `is_custom` and `created_by` mark where
  a row came from; `source_id` (the free-exercise-db slug) lets the startup seed
  run again without making duplicates.
- **The seed data is vendored** at `backend/app/data/exercises.json` so seeding
  needs no network access and builds are reproducible. Refresh it later by
  re-downloading from the free-exercise-db repo.
- **Units / images** aren't part of these milestones. Weight/distance will be
  stored in canonical units (kg / meters / seconds) and displayed in your
  preferred units when we build set logging; exercise images come later,
  downloadable for offline.

---

## Next milestone

One of:
- **Workout history**: a screen listing finished workouts, and using the last
  time you did an exercise to fill the "previous" hint on each set row.
- **Routines**: a `routines` table (a named, ordered list of exercises),
  endpoints to create and list them, and wiring the home screen's **New Routine**
  button and routine list to real data.
