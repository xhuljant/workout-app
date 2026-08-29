#!/bin/sh
# Container entrypoint: bring the database schema up to date, then start the app.
#
# `alembic upgrade head` is idempotent -- on an already-current database it does
# nothing. On a fresh database it creates every table from the migrations. This
# replaces the old `Base.metadata.create_all` + hand-written ALTER blocks, so a
# schema change never again means `docker compose down -v`.
set -e

echo "[entrypoint] running database migrations (alembic upgrade head)..."
alembic upgrade head

echo "[entrypoint] starting: $*"
exec "$@"
