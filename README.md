# Workout App

A self-hosted workout tracker. Built piece by piece.

**Milestone 1 (this build): accounts + login.** A FastAPI backend with a Postgres
database and a login/register screen, so we can confirm the whole login round-trip
works before adding anything else.

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
│   │   ├── models.py       # the `users` table
│   │   ├── schemas.py      # request/response shapes (validation)
│   │   ├── security.py     # argon2 password hashing + JWT tokens
│   │   ├── deps.py         # get_current_user (protects private routes)
│   │   ├── main.py         # app startup + wiring
│   │   └── routers/
│   │       └── auth.py     # /register, /login, /refresh, /me
│   └── static/             # the login page (served by the API for now)
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

You can also poke the API directly through its auto-generated docs at
**http://localhost:8000/docs**.

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
- **Sync-friendly columns** (`updated_at`, `deleted_at`, UUID ids) are already on
  the `users` table; the actual sync endpoint comes later, once the basics exist.
- **Units / images** aren't part of this milestone. Weight/distance will be stored
  in canonical units (kg / meters / seconds) and displayed in your preferred units
  when we build set logging; exercise images come later, downloadable for offline.

---

## Next milestone

Exercises: seed the library from the public **free-exercise-db**, add the
`exercises` table and endpoints, and a screen to browse/search them — then test.
