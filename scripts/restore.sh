#!/usr/bin/env bash
# Restore the database from a pg_dump custom-format file.
# Usage:  ./scripts/restore.sh backups/workout-2026-08-28-120000.dump
#         (or: make restore FILE=backups/workout-2026-08-28-120000.dump)
#
# This REPLACES the current contents of the database. It stops the api first so
# nothing is writing mid-restore, then brings it back up.
set -euo pipefail

cd "$(dirname "$0")/.."

FILE="${1:-}"
if [ -z "$FILE" ] || [ ! -f "$FILE" ]; then
  echo "usage: $0 <path-to-.dump>" >&2
  exit 1
fi

# shellcheck disable=SC1091
[ -f .env ] && set -a && . ./.env && set +a

read -r -p "Restore '$FILE' over database '${POSTGRES_DB}'? This overwrites current data. [y/N] " ok
[ "$ok" = "y" ] || { echo "aborted"; exit 1; }

echo "Stopping api..."
docker compose stop api

echo "Restoring..."
docker compose exec -T db \
  pg_restore --clean --if-exists --no-owner -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" < "$FILE"

echo "Starting api (runs 'alembic upgrade head')..."
docker compose start api
echo "Done."
