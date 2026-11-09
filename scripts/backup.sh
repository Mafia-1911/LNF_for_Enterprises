#!/usr/bin/env bash
# Encrypted database backup (plan §11.2, local stand-ins per ADR-0009):
#   pg_dump (custom format) → age encryption → MinIO bucket lostfound-backups. Keeps 35 days.
# The age recipient comes from BACKUP_AGE_RECIPIENT; locally, a key pair is created on first use in
# .backup-keys/ (git-ignored). Keep the identity file safe: without it a backup can't be restored.
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/tools.sh

compose=(docker compose -f infra/docker-compose.dev.yml)
AGE="$(ensure_tool age)"
KEYS_DIR=".backup-keys"
IDENTITY="${BACKUP_AGE_IDENTITY_FILE:-${KEYS_DIR}/age-identity.txt}"

if [[ -z "${BACKUP_AGE_RECIPIENT:-}" ]]; then
  if [[ ! -f "$IDENTITY" ]]; then
    mkdir -p "$KEYS_DIR" && chmod 700 "$KEYS_DIR"
    "$(ensure_tool age-keygen)" -o "$IDENTITY" 2>/dev/null
    chmod 600 "$IDENTITY"
    echo "Created a local backup key in $IDENTITY (keep it; restores need it)."
  fi
  BACKUP_AGE_RECIPIENT="$(grep -o 'age1[0-9a-z]*' "$IDENTITY" | head -1)"
fi

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
name="lostfound-${stamp}.dump.age"
workdir="$(mktemp -d)"
trap 'rm -rf "$workdir"' EXIT

echo "Dumping the database…"
"${compose[@]}" exec -T -e PGPASSWORD=owner-dev-only postgres \
  pg_dump --format=custom --compress=9 --no-owner -U lf_owner -h 127.0.0.1 lostfound \
  | "$AGE" -r "$BACKUP_AGE_RECIPIENT" -o "${workdir}/${name}"

size="$(stat -c %s "${workdir}/${name}")"
if (( size < 1024 )); then
  echo "The backup is only ${size} bytes, which looks wrong; not uploading it." >&2
  exit 1
fi

echo "Uploading ${name} (${size} bytes) to MinIO…"
"${compose[@]}" run --rm -T --no-deps --entrypoint sh minio-init -c \
  "mc alias set local http://minio:9000 \"\$MINIO_ROOT_USER\" \"\$MINIO_ROOT_PASSWORD\" >/dev/null && \
   mc pipe --quiet local/lostfound-backups/${name} && \
   mc rm --recursive --force --older-than 35d local/lostfound-backups/ >/dev/null 2>&1 || true" \
  < "${workdir}/${name}"

echo "Backup stored: lostfound-backups/${name}"
