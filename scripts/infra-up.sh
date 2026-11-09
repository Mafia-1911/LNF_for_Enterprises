#!/usr/bin/env bash
# Starts the local stand-ins and waits until they are healthy and the buckets exist.
# (`up --wait` alone reports failure because minio-init is a one-shot container.)
set -euo pipefail
compose=(docker compose -f "$(dirname "$0")/../infra/docker-compose.dev.yml")
"${compose[@]}" up -d
"${compose[@]}" up -d --wait --wait-timeout 180 postgres minio mailpit mock-oidc
if ! "${compose[@]}" wait minio-init >/dev/null 2>&1; then
  echo "Creating the storage buckets failed. Run: ${compose[*]} logs minio-init" >&2
  exit 1
fi
echo "Local services are ready."
