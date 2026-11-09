#!/usr/bin/env bash
# Monthly restore test (plan §11.2): a backup that has never been restored doesn't count.
#   newest backup from MinIO → age decrypt → pg_restore into a throwaway Postgres container →
#   verify-audit against it → row counts → container removed.
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/tools.sh

compose=(docker compose -f infra/docker-compose.dev.yml)
AGE="$(ensure_tool age)"
IDENTITY="${BACKUP_AGE_IDENTITY_FILE:-.backup-keys/age-identity.txt}"
[[ -f "$IDENTITY" ]] || { echo "No backup key at $IDENTITY; run scripts/backup.sh first or set BACKUP_AGE_IDENTITY_FILE." >&2; exit 1; }

mc() {
  "${compose[@]}" run --rm -T --no-deps --entrypoint sh minio-init -c \
    "mc alias set local http://minio:9000 \"\$MINIO_ROOT_USER\" \"\$MINIO_ROOT_PASSWORD\" >/dev/null && mc $*"
}

latest="$(mc ls --json local/lostfound-backups/ | grep -o '"key":"[^"]*"' | cut -d'"' -f4 | sort | tail -1)"
[[ -n "$latest" ]] || { echo "There are no backups in lostfound-backups; run scripts/backup.sh first." >&2; exit 1; }
echo "Restoring ${latest}…"

workdir="$(mktemp -d)"
container="lf-restore-test-$$"
port="${RESTORE_TEST_PORT:-54399}"
cleanup() { docker rm -f "$container" >/dev/null 2>&1 || true; rm -rf "$workdir"; }
trap cleanup EXIT

mc cat "local/lostfound-backups/${latest}" > "${workdir}/backup.age"
"$AGE" -d -i "$IDENTITY" -o "${workdir}/backup.dump" "${workdir}/backup.age"

docker run -d --rm --name "$container" -e POSTGRES_PASSWORD=restore-test-only -p "127.0.0.1:${port}:5432" \
  postgres:16.15-alpine3.24 >/dev/null
for _ in $(seq 1 60); do
  docker exec "$container" pg_isready -U postgres -q 2>/dev/null && break
  sleep 1
done
docker exec "$container" psql -q -U postgres -c 'CREATE DATABASE restore_test' -c 'CREATE ROLE lf_app' -c 'CREATE ROLE lf_owner'
docker exec -i "$container" pg_restore --no-owner --exit-on-error -U postgres -d restore_test < "${workdir}/backup.dump"

echo "Checking the audit log in the restored copy…"
DATABASE_URL="postgres://postgres:restore-test-only@127.0.0.1:${port}/restore_test" pnpm --silent db:verify-audit

docker exec "$container" psql -q -U postgres -d restore_test -At -c \
  "select 'tenants: ' || count(*) from tenants union all select 'lost reports: ' || count(*) from lost_reports union all select 'audit events: ' || count(*) from audit_events"
echo "Restore test passed: ${latest}"
