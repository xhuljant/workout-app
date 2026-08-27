# Workout App

A self-hosted workout tracker. Built piece by piece.

**Milestone 1: accounts + login.** A FastAPI backend with a Postgres database and
a login/register screen, so we can confirm the whole login round-trip works
before adding anything else.

**Milestone 2 (this build): the exercise library.** After login you land on a
home screen. From there, **Exercises** opens a searchable library that is seeded
on startup from the public **free-exercise-db** (800+ exercises). Any user can
add a custom exercise, and because the library is one shared table it shows up
for everyone.

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
│   │   ├── models.py       # the `users` and `exercises` tables
│   │   ├── schemas.py      # request/response shapes (validation)
│   │   ├── security.py     # argon2 password hashing + JWT tokens
│   │   ├── deps.py         # get_current_user (protects private routes)
│   │   ├── seed.py         # loads the exercise library on startup
│   │   ├── main.py         # app startup + wiring
│   │   ├── data/
│   │   │   └── exercises.json   # vendored free-exercise-db snapshot (public domain)
│   │   └── routers/
│   │       ├── auth.py     # /register, /login, /refresh, /me
│   │       └── exercises.py    # GET/POST /api/exercises
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

To stop: press `Ctrl-C`. To also wipe the database and start fresh:
`docker compose down -v`.

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
- **Tables are created automatically on startup.** That's fine while the schema is
  simple; before it gets complex we'll switch to proper migrations (Alembic) so
  schema changes don't require wiping data.
- **Tokens live in `localStorage`** for now — convenient and fine on your private
  network. We can harden this (httpOnly refresh cookie) before wider exposure.
- **Sync-friendly columns** (`updated_at`, `deleted_at`, UUID ids) are on every
  table (`users`, `exercises`); the actual sync endpoint comes later, once the
  basics exist.
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

Routines: an `routines` table (a named, ordered list of exercises), endpoints to
create and list them, and wiring the home screen's **New Routine** button and
routine list to real data — then test.
