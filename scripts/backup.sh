#!/usr/bin/env bash
# Take an immediate, on-demand database backup into ./backups/.
# Usage:  ./scripts/backup.sh   (or: make backup)
#
# The db-backup container also does this automatically once a day; this is for
# "I'm about to do something risky" moments (upgrades, `down -v`, ...).
set -euo pipefail

cd "$(dirname "$0")/.."
mkdir -p backups

# shellcheck disable=SC1091
[ -f .env ] && set -a && . ./.env && set +a

ts=$(date +%Y-%m-%d-%H%M%S)
out="backups/workout-manual-${ts}.dump"

docker compose exec -T db \
  pg_dump -Fc -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" > "$out"

echo "Wrote $out ($(du -h "$out" | cut -f1))"
