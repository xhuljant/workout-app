# Workout Log

A self-hosted, multi-account workout tracker. A FastAPI + PostgreSQL backend
serves a dependency-free vanilla-JavaScript single-page app from the same
process. It's built to run on a home server on a private network; the client is
mobile-first and installs to the home screen as a PWA.

---

## Features

**Accounts**
Register and log in with an email and password (argon2id hashing). Sessions use a
short-lived JWT access token (15 min) and a long-lived refresh token (90 days);
the client refreshes silently in the background. Change password and delete
account are supported; account deletion is a soft delete and the email is
tombstoned so it can be reused.

**Exercise library**
One shared library, seeded on first boot from a vendored snapshot of
[free-exercise-db](https://github.com/yuhonas/free-exercise-db) (~873 exercises).
Any user can add a custom exercise and it becomes visible to everyone. Each
exercise has a tracking mode — *weight × reps*, *reps only*, *time*, or
*distance + time* — that determines how its sets are logged and scored.

**Live workouts**
Start an empty session or one pre-filled from a routine. The in-progress workout
is server-side state, so it resumes exactly where it was left after a reload, a
closed tab, or on another device. A session shows a running duration timer, an
adjustable rest timer, and live volume / completed-set tallies. Completed sets
are checked for personal records; each set row shows the previous session's
numbers and can autofill from them.

**Routines & folders**
Reusable templates (an ordered list of exercises with planned sets), grouped into
folders that can be renamed, reordered, and collapsed. On **Finish**, the app can
fold a session's exercise changes back into the routine it came from.

**History & analytics**
A finished-workout list with a detail view, per-exercise statistics (heaviest
set, best estimated 1RM, totals, etc.) with an inline progress chart, and a
training calendar.

**Body measurements**
Dated entries stored in canonical units (kg / cm / %) and converted to the user's
preferred units for display, with up to four progress photos per entry.

**Data ownership**
CSV export of every logged set; full-account JSON export and import
(merge-by-id — importing never overwrites existing rows); and a Trash screen —
every delete is soft and restorable for 30 days.

---

## Architecture

### Stack

| Layer | Choice |
| --- | --- |
| Language / runtime | Python 3.12 |
| Web framework | FastAPI (ASGI, served by Uvicorn) |
| ORM | SQLAlchemy 2.0, synchronous |
| Validation | Pydantic v2 schemas, kept separate from the ORM models |
| Database | PostgreSQL 16, driver `psycopg2` |
| Migrations | Alembic |
| Front-end | one `index.html` + `style.css` + `app.js` (~3k lines) — no framework, no build step |

Backend dependencies are pinned in `backend/requirements.txt`.

### Request flow

The front-end is served as static files by the same FastAPI app, so there is no
CORS surface. API routes are registered first and take priority; anything that
doesn't match falls through to the static mount.

```
browser ──► /api/health
        └─► /api/{auth,exercises,workouts,routines,folders,measurements,data}/…
                     │
                     ├─ public:    /api/auth/{register,login,refresh}
                     └─ protected: everything else
                                   └─ Depends(get_current_user)  ← backend/app/deps.py
                                      verifies the Bearer access token,
                                      loads the matching non-deleted user
```

### Data model

Six tables: `users`, `exercises`, `workouts`, `routines`, `folders`,
`measurement_entries`. Shared conventions on every table:

- **UUID primary keys** — a client can mint an id offline without a round trip.
- **`created_at` / `updated_at`** timestamps.
- **`deleted_at`** — soft delete everywhere; nothing is hard-deleted by a request.

A workout's or routine's body is a single **JSONB `content` blob**
(`{"exercises": [{ "sets": [...] }]}`), re-saved wholesale on each edit rather
than stored as child set rows — one small write instead of many upserts, and the
data volume is tiny.

Integrity guards:

- Partial unique indexes: **one active workout per user**, **one default folder
  per user**.
- `CHECK` constraints on `workouts.status`, `exercises.tracking_type`, and
  non-negative `rest_seconds`.
- `workouts.content_version` provides **optimistic concurrency**: a save carrying
  a stale version gets `409 Conflict` with the current server copy, rather than
  silently overwriting another device's edits.

### Schema migrations

The schema is versioned in `backend/alembic/versions/`. `alembic upgrade head`
runs as the first half of the api container's command (see `backend/Dockerfile`),
before Uvicorn starts — so a fresh database is built entirely from the migrations
and an existing one is upgraded in place. Changing a column never requires
wiping data.

### Front-end notes

- `authFetch()` wraps `fetch` with the access token, retries once through
  `/api/auth/refresh` on a `401`, and raises a `TransientNetworkError` (rather
  than logging out) when the server is merely unreachable.
- A `localStorage` write-ahead log mirrors unsaved workout edits and retries the
  save with backoff, so a dropped connection or a closed tab never loses sets.
- `showView()` switches between mutually exclusive top-level screens.
- Progress charts are hand-built inline SVG. Autocomplete is a small custom
  widget (`<datalist>` is unreliable on iOS Safari).
- `manifest.webmanifest` + theme-color meta tags make it installable
  ("Add to Home Screen").

### Deployment

`docker-compose.yml` runs three services:

| Service | Image / build | Role |
| --- | --- | --- |
| `db` | `postgres:16.6` | database; named volume `workout_db_data`; `pg_isready` healthcheck |
| `api` | built from `backend/` | migrations + Uvicorn; `/api/health` healthcheck (runs a real `SELECT 1`) |
| `db-backup` | `postgres:16.6` | `pg_dump` once a day into `./backups/`, 14-day retention |

---

## Design decisions

- **No front-end framework, on purpose.** The UI is small and long-lived; plain
  DOM code has no build step, no dependency churn, and nothing to keep patched.
- **The API serves the front-end.** One origin, no CORS config. If a separate
  PWA build is ever needed it can become its own service.
- **JSONB `content` blob, not child tables.** The editor re-sends the whole
  workout on every keystroke-debounced save; a blob makes that one row write.
- **Soft delete + Trash everywhere.** `deleted_at` on every table; a background
  purge removes rows older than 30 days on startup.
- **One shared exercise library.** `is_custom` / `created_by` record provenance;
  `source_id` (the free-exercise-db slug) lets the seed re-run without
  duplicating.
- **Sync-friendly columns, no sync engine yet.** UUIDs, `updated_at`,
  `deleted_at` are in place for a future offline client; today concurrent edits
  are last-write-wins, moderated by `content_version`.
- **Tokens in `localStorage`.** Convenient and acceptable on a private network;
  move the refresh token to an httpOnly cookie before any wider exposure.

---

## Project layout

```
workout-app/
├── docker-compose.yml         # db + api + db-backup
├── Makefile                   # up / down / backup / restore / migrate / revision / test
├── .env.example               # copy to .env
├── scripts/
│   ├── backup.sh              # on-demand pg_dump into ./backups/
│   └── restore.sh             # pg_restore from a dump
└── backend/
    ├── Dockerfile             # runs `alembic upgrade head` then uvicorn
    ├── requirements.txt       # pinned runtime dependencies
    ├── requirements-dev.txt   # pytest + httpx
    ├── pytest.ini
    ├── alembic.ini
    ├── alembic/
    │   ├── env.py
    │   └── versions/          # 0001_baseline … 0004_check_constraints
    ├── app/
    │   ├── config.py          # settings from environment variables
    │   ├── database.py        # engine + session factory
    │   ├── models.py          # the 6 SQLAlchemy tables
    │   ├── schemas.py         # Pydantic request/response shapes
    │   ├── security.py        # argon2 hashing + JWT create/verify
    │   ├── deps.py            # get_current_user
    │   ├── seed.py            # loads the exercise library on first boot
    │   ├── main.py            # app assembly, /api/health, startup tasks
    │   ├── data/exercises.json   # vendored free-exercise-db snapshot (public domain)
    │   └── routers/
    │       ├── auth.py           # register / login / refresh / me / password / delete
    │       ├── exercises.py      # library list + custom create + per-exercise stats
    │       ├── workouts.py       # start / resume / edit / finish / discard / history / trash
    │       ├── routines.py       # CRUD + reorder
    │       ├── folders.py        # CRUD + reorder + default folder
    │       ├── measurements.py   # CRUD + photos + trash
    │       └── data.py           # full-account JSON export / import
    ├── static/                # index.html, style.css, app.js, manifest.webmanifest
    └── tests/                 # pytest suite (needs a throwaway Postgres)
```

---

## Running it

**Prerequisite:** Docker Desktop (bundles `docker compose`). Python and Postgres
run inside the containers.

1. Create the config file and set the secrets:

   ```bash
   cp .env.example .env
   # generate a strong signing key:
   python -c "import secrets; print(secrets.token_urlsafe(64))"
   # paste it as JWT_SECRET in .env, and set a real POSTGRES_PASSWORD
   ```

2. Build and start:

   ```bash
   docker compose up --build
   ```

3. Open **http://localhost:8000**. Interactive API docs are at **/docs**.

Stop with `Ctrl-C`, then `docker compose down`.

> **Do not run `docker compose down -v`.** `-v` deletes the database volume —
> every account, workout, and measurement. Schema changes are handled by
> migrations, so you never need it. If you really mean to wipe and start over,
> run `make backup` first.

---

## Operations

### Migrations

- **Fresh install** — nothing to do; `docker compose up` builds the schema from
  the migrations.
- **A database that predates migrations** — record the current schema as the
  baseline once, then upgrade:

  ```bash
  docker compose run --rm api alembic stamp 0001
  docker compose up --build
  ```

- **Add a migration** after editing `backend/app/models.py`:

  ```bash
  make revision M="add whatever column"
  # review the generated file in backend/alembic/versions/, then:
  make migrate
  ```

### Backups

The `db-backup` service writes a `pg_dump` into `./backups/` once a day and keeps
14 days. Take one on demand before anything risky:

```bash
make backup
```

Restore from a dump (replaces current data; stops the api first):

```bash
make restore FILE=backups/workout-2026-08-28-1200.dump
```

Keep a copy of `.env` somewhere safe — losing `JWT_SECRET` doesn't lose data, but
it invalidates every existing session.

### Upgrading PostgreSQL

The image is pinned (`postgres:16.6`). Patch bumps within 16.x are drop-in. A
**major** bump (17+) changes the on-disk format: `make backup`, change the tag,
`docker compose down`, delete the volume, `docker compose up`, then
`make restore FILE=…`.

### Sanity checks

```bash
# finished workouts and how many exercises each has
docker compose exec db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  -c "select status, started_at, finished_at, jsonb_array_length(content->'exercises') as exercises from workouts;"

# library size, and whether any custom exercises exist
docker compose exec db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  -c "select count(*), bool_or(is_custom) from exercises;"
```

---

## Testing

The suite runs against a **real, throwaway** PostgreSQL (never your live
database). It builds the schema by running the migrations, then exercises the API
through `fastapi.testclient`.

```bash
cd backend
pip install -r requirements.txt -r requirements-dev.txt

DATABASE_URL=postgresql+psycopg2://postgres:postgres@localhost:5432/workout_test \
JWT_SECRET=test \
  python -m pytest
```

Coverage: auth round-trip and email normalisation, the workout lifecycle plus the
`409` optimistic-concurrency path, `previous` / `stats` math (Epley 1RM, session
volume, per-mode aggregates), the one-default-folder invariant, measurement CRUD
with photos, and JSON export → import into a fresh account.

---

## Admin CLI

There's no admin role or admin UI — account support tasks are done from the
command line, against the running `api` container, with `backend/app/admin_cli.py`
(`docker compose exec api python -m app.admin_cli <command> ...`). Every command
looks a user up by email and only touches non-deleted accounts.

| Command | What it does |
| --- | --- |
| `list-users [query]` | List active accounts, optionally filtered by email/name substring. |
| `reset-password <email> [--password PWD]` | Set a new password. Omit `--password` to generate and print a random one. |
| `rename-user <email> "New Name"` | Change an account's display name. |
| `clear-history <email> [--yes]` | Soft-delete all of that account's logged workouts (recoverable from Trash for 30 days, same as deleting them one by one). Asks for confirmation unless `--yes` is passed. |
| `delete-account <email> [--yes]` | Soft-delete the account — same effect as the in-app "Delete account" (routines and any active workout are soft-deleted, the email is tombstoned, finished history is left in place). Asks for confirmation unless `--yes` is passed. |

Examples:

```bash
docker compose exec api python -m app.admin_cli list-users
docker compose exec api python -m app.admin_cli reset-password alice@example.com
docker compose exec api python -m app.admin_cli rename-user alice@example.com "Alice K"
docker compose exec api python -m app.admin_cli clear-history alice@example.com
docker compose exec api python -m app.admin_cli delete-account alice@example.com
```

---

## Configuration reference

Environment variables (compose reads `.env` automatically):

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `POSTGRES_USER` | yes | — | compose only; used to create the DB role |
| `POSTGRES_PASSWORD` | yes | — | compose only |
| `POSTGRES_DB` | yes | — | compose only |
| `DATABASE_URL` | yes | assembled by compose | `postgresql+psycopg2://user:pass@db:5432/name` |
| `JWT_SECRET` | yes | — | long random string; signs all tokens |
| `JWT_ALGORITHM` | no | `HS256` | |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | no | `15` | |
| `REFRESH_TOKEN_EXPIRE_DAYS` | no | `90` | |

The optional four are read by `backend/app/config.py`; the rest live in `.env`.
