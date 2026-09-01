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
*distance + time* — that determines how its sets are logged and scored. Editing a
custom exercise's name rewrites it in every past workout and current routine that
used it; category / equipment / muscles aren't denormalized, so they update
everywhere on their own. Exercise detail views can show example media — two
start/end-position stills alternated for a GIF-like demo (see
[Exercise example media](#exercise-example-media)); custom exercises can carry
two uploaded photos of their own.

**Live workouts**
Start an empty session or one pre-filled from a routine. The in-progress workout
is server-side state, so it resumes exactly where it was left after a reload, a
closed tab, or on another device. A session shows a running duration timer, a
rest timer that can be set per exercise (heavier lifts get longer rests), and
live volume / completed-set tallies. With a VAPID keypair configured, an optional
Web Push notification (with sound) fires when the rest timer ends while the app
is backgrounded — see [Deployment](#deployment). Completed sets are checked for
personal records; each set row shows the previous session's numbers and can
autofill from them.

**Routines & folders**
Reusable templates (an ordered list of exercises with planned sets), grouped into
folders that can be renamed, reordered, and collapsed. On **Finish**, the app can
fold a session's exercise changes back into the routine it came from.

**History & analytics**
A finished-workout list with a detail view, per-exercise statistics (heaviest
set, best estimated 1RM, totals, etc.) with an inline progress chart, and a
training calendar.

**Progress** (☰ menu)
Three tabs:
- **Exercises** — pick any lift you've logged to see its stat tiles, progress
  chart, and per-session history (read-only).
- **Measurements** — dated body-measurement entries in canonical units
  (kg / cm / %), converted to the user's preferred units, with up to four
  progress photos each; a chosen metric is charted over time.
- **Photos** — a date-ordered progress-photo timeline with each day's numbers
  beside it, a swipeable full-screen viewer, and a two-date **Compare** view
  with per-measurement deltas. Can be gated behind a PIN (see
  [Progress-photo lock](#progress-photo-lock)).

**Appearance**
Light / dark theme, set in Settings to **Match device**, **Light**, or **Dark**.
The choice is saved to the account (syncs across devices) and mirrored to
`localStorage` so it applies before first paint with no flash.

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
- `sw.js` is a minimal, push-only service worker (no offline caching): it shows
  the "rest over" notification unless an app window is already focused. `app.js`
  and `style.css` are cache-busted with a `?v=` query bumped on every release.

### Deployment

`docker-compose.yml` runs three services:

| Service | Image / build | Role |
| --- | --- | --- |
| `db` | `postgres:16.6` | database; named volume `workout_db_data`; `pg_isready` healthcheck |
| `api` | built from `backend/` | migrations + Uvicorn; `/api/health` healthcheck (runs a real `SELECT 1`) |
| `db-backup` | `postgres:16.6` | `pg_dump` once a day into `./backups/`, 14-day retention |

The `api` service must run as a **single** Uvicorn process (no `--workers`): the
rest-timer push sender is an in-process background loop, so multiple workers
would send each notification more than once.

### HTTPS over Tailscale

The app is fine on plain `http://<host>:8000` over the tailnet for normal use.
You only need HTTPS for the rest-timer **push notifications** below — service
workers and the Push API refuse to run outside a "secure context", and
`http://100.x.y.z:8000` or a bare MagicDNS name doesn't count.

Tailscale can front the app with a real Let's Encrypt cert for its
`<machine>.<tailnet>.ts.net` name. TLS is terminated by `tailscaled`; the
container still only sees plain HTTP on `:8000`, so nothing in this repo changes.

1. **Admin console** — at <https://login.tailscale.com/admin/dns> enable
   **MagicDNS** and **HTTPS Certificates**. (Without HTTPS Certificates the TLS
   handshake fails and Safari reports "cannot establish a secure connection".)

2. **On the host**, point a Tailscale HTTPS listener at the app:

   ```
   tailscale serve --bg http://localhost:8000
   ```

   Check it:

   ```
   tailscale serve status
   # https://plex-host-pc.tailf9097.ts.net (tailnet only)
   # |-- / proxy http://localhost:8000
   ```

   `https://` implies port 443 — that's the `tailscaled` listener; the `8000`
   comes from the proxy rule, not the URL. Chain:
   `Safari :443 → tailscaled (TLS) → localhost:8000 → api container`.

3. **Provision the cert** (also the quickest way to see any error):

   ```
   tailscale cert plex-host-pc.tailf9097.ts.net
   ```

   Success writes `<name>.crt` / `<name>.key`. `HTTPS features are not enabled`
   means step 1 isn't done yet.

4. **On the phone**, make sure the Tailscale app is connected (not "key
   expired"), then open the exact URL — no port, no path, all lowercase:
   `https://plex-host-pc.tailf9097.ts.net`.

To stop fronting it later: `tailscale serve reset` (clears all serve config on
the node); `tailscale serve status` shows the current state.

### Rest-timer push notifications (optional)

"Rest timer notifications" (Settings → profile) uses the Web Push API
so the alert — with sound — fires even when the PWA is backgrounded or the phone
is locked. Off unless a VAPID keypair is configured; when unset,
`/api/push/vapid-key` returns 404 and the toggle stays hidden.

**1. Generate a VAPID keypair** (the crypto libs are in the `api` image):

```
docker compose exec api python -c "import base64; from cryptography.hazmat.primitives.asymmetric import ec; from cryptography.hazmat.primitives import serialization as s; k=ec.generate_private_key(ec.SECP256R1()); b=lambda x: base64.urlsafe_b64encode(x).decode().rstrip('='); print('VAPID_PUBLIC_KEY='+b(k.public_key().public_bytes(s.Encoding.X962, s.PublicFormat.UncompressedPoint))); print('VAPID_PRIVATE_KEY='+b(k.private_numbers().private_value.to_bytes(32,'big')))"
```

(or `docker run --rm node:20-alpine npx -y web-push generate-vapid-keys` — same
base64url format.)

**2. Put the output in `.env`** — uncomment the lines, no `#`, no extra spaces:

```
VAPID_PUBLIC_KEY=BKej…            # from step 1
VAPID_PRIVATE_KEY=qP7J…           # from step 1
VAPID_SUBJECT=mailto:you@example.com   # a real address; push services reject fakes
```

**3. Recreate the api container** and confirm it picked the keys up:

```
docker compose up -d api          # no --build; only env changed
docker compose logs api --tail 30 | Select-String push
# want:  [push] rest-timer notification sender started.
# not:   [push] VAPID keys not set -- rest-timer notifications disabled.
```

**4. On the iPhone** (needs the HTTPS URL from the section above):

- Open `https://<machine>.<tailnet>.ts.net` in Safari → Share → **Add to Home
  Screen**. iOS 16.4+ only delivers Web Push to a home-screen-installed PWA.
- Open it *from the Home Screen icon*, go to Settings, tick **Rest timer
  notifications**, Save, and allow the permission prompt.
- Test: start a workout, check a set with a short rest, lock the phone — a
  notification with sound should arrive when the timer hits zero.

The keypair is permanent. Back up `.env` with your DB dumps; regenerating the
keys invalidates every device's subscription (each must re-toggle the setting).
`.env` is git-ignored — keep it that way.

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

2. *(Optional, one-time)* Vendor the exercise demo images — they're gitignored,
   so a fresh checkout has none until you run this. Skipping it just means
   exercises show no example photos:

   ```bash
   git clone https://github.com/yuhonas/free-exercise-db /tmp/fedb
   python backend/scripts/vendor_exercise_images.py /tmp/fedb
   ```

   The ~99 MB of JPEGs land in `backend/static/exercises/` and get baked into
   the `api` image by the next build. See [Exercise example media](#exercise-example-media).

3. Build and start:

   ```bash
   docker compose up --build
   ```

4. Open **http://localhost:8000**. Interactive API docs are at **/docs**.

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
with photos, the progress-photo PIN (set / change / verify / remove + admin CLI),
exercise example media (seed back-fill, custom-upload validation), and JSON
export → import into a fresh account.

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
| `set-photo-pin <email> <pin>` | Set the account's progress-photo PIN (4–8 digits). Recovery path when someone is locked out and has also forgotten the account password. |
| `clear-photo-pin <email>` | Remove the account's progress-photo PIN. |

Examples:

```bash
docker compose exec api python -m app.admin_cli list-users
docker compose exec api python -m app.admin_cli reset-password alice@example.com
docker compose exec api python -m app.admin_cli rename-user alice@example.com "Alice K"
docker compose exec api python -m app.admin_cli clear-history alice@example.com
docker compose exec api python -m app.admin_cli delete-account alice@example.com
docker compose exec api python -m app.admin_cli clear-photo-pin alice@example.com
```

### Progress-photo lock

Settings → **Progress photo lock** sets a 4–8 digit PIN that's asked for before
the Progress tab's photo timeline (and any single entry that has photos) will
show. It re-locks when the app is backgrounded, on logout, after 5 minutes, and
on every reload. "Forgot PIN?" clears it with the account password.

This is a **UI deterrent**, not encryption: the photo blobs are still returned
by `GET /api/measurements/photos` and included in the JSON data export for any
logged-in session. It's meant for "someone picks up my unlocked phone", not a
determined attacker with the account credentials.

### Exercise example media

Each library exercise can show the two start/end-position stills from
[free-exercise-db](https://github.com/yuhonas/free-exercise-db) (alternated for a
GIF-like demo, tap to enlarge).

The image files are **gitignored, not committed** (`backend/static/exercises/`),
so a 99 MB blob stays out of the repo and its history. Run the one-off vendoring
step once per fresh checkout, pointing at a local checkout of that repo:

```bash
git clone https://github.com/yuhonas/free-exercise-db /tmp/fedb
python backend/scripts/vendor_exercise_images.py /tmp/fedb
```

That copies ~1.7k JPEGs (~99 MB) into `backend/static/exercises/`; `docker compose
build` bakes them into the `api` image (via `COPY . .`), and they're served
locally at `/exercises/<slug>/N.jpg` — no runtime network dependency. The script
is idempotent, so re-running it only copies what's missing. Until you run it the
app just shows no media.

To serve the images from a CDN instead of hosting them, set `EXERCISE_IMG_BASE`
at the top of `backend/static/app.js` (trades the disk cost for a third-party
runtime dependency and no offline support). Custom exercises can carry up to two
uploaded photos of their own, added in the exercise editor.

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
| `VAPID_PUBLIC_KEY` | no | — | enables rest-timer Web Push; unset = feature off |
| `VAPID_PRIVATE_KEY` | no | — | pair with the public key; see `.env.example` |
| `VAPID_SUBJECT` | no | `mailto:admin@example.com` | contact the push service can reach |

The optional variables are read by `backend/app/config.py`; the rest live in `.env`.
