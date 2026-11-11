#!/usr/bin/env bash
# Starts the local stand-ins and waits until they are healthy and the buckets exist.
# (`up --wait` alone reports failure because minio-init is a one-shot container.)
# If something doesn't start, it prints each container's state and recent logs; in GitHub Actions
# that summary is also an annotation on the run, readable without opening the log.
set -euo pipefail
compose=(docker compose -f "$(dirname "$0")/../infra/docker-compose.dev.yml")
log="$(mktemp)"
trap 'rm -f "$log"' EXIT

run() { "$@" 2>&1 | tee -a "$log"; }

# minio-init is one-shot: poll its state rather than `compose wait`, which differs across versions.
wait_for_buckets() {
  local state
  for _ in $(seq 1 90); do
    state="$("${compose[@]}" ps -a --format '{{.State}} {{.ExitCode}}' minio-init 2>/dev/null || true)"
    case "$state" in
      'exited 0') return 0 ;;
      exited*) echo "Creating the storage buckets failed (minio-init: $state)." | tee -a "$log" >&2; return 1 ;;
    esac
    sleep 2
  done
  echo "Creating the storage buckets timed out." | tee -a "$log" >&2
  return 1
}

start() {
  run "${compose[@]}" up -d &&
    run "${compose[@]}" up -d --wait --wait-timeout 180 postgres minio mailpit mock-oidc &&
    wait_for_buckets
}

diagnose() {
  local states logs
  states="$("${compose[@]}" ps -a --format '{{.Service}}: {{.State}} {{.Status}}' 2>&1 || true)"
  logs="$("${compose[@]}" logs --no-color --tail 15 2>&1 || true)"
  printf '\nContainers:\n%s\n\nRecent logs:\n%s\n' "$states" "$logs" >&2
  if [[ "${GITHUB_ACTIONS:-}" == "true" ]]; then
    local summary
    local output
    output="$(grep -vE '^ *(Container|Volume|Network) ' "$log" | tail -n 20 || true)"
    summary="$(printf 'Output:\n%s\n\nContainers:\n%s\n\nLogs:\n%s' "$output" "$states" "$(tail -n 40 <<<"$logs")")"
    summary="${summary//'%'/'%25'}"
    summary="${summary//$'\r'/}"
    echo "::error title=Local services did not start::${summary//$'\n'/'%0A'}"
  fi
}

if ! start; then
  diagnose
  echo "The local services did not start; see the containers and logs above, fix the cause and run this again." >&2
  exit 1
fi
echo "Local services are ready."
