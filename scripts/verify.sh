#!/usr/bin/env bash
# pnpm verify — every gate CI runs, in the same order, on your machine.
#
#   pnpm verify            all gates
#   pnpm verify --quick    skip the slow ones (end-to-end, mutation, semgrep)
#
# Each gate runs even when an earlier one failed, so one run shows everything that needs fixing.
# Needs Docker (local services) and, for semgrep, uv (https://docs.astral.sh/uv/). Nothing is sent
# anywhere: semgrep runs with metrics off and the tools are pinned and checksum-verified.
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT" || exit 1
# shellcheck source=scripts/tools.sh
source scripts/tools.sh
set +e # tools.sh enables errexit; gates report their own failures

QUICK=false
[[ "${1:-}" == "--quick" ]] && QUICK=true

SEMGREP_VERSION="1.184.0"
declare -a RESULTS=()
FAILED=0

gate() {
  local name="$1"
  shift
  printf '\n\033[1m▶ %s\033[0m\n' "$name"
  local start=$SECONDS
  if "$@"; then
    RESULTS+=("PASS  ${name} ($((SECONDS - start))s)")
  else
    RESULTS+=("FAIL  ${name} ($((SECONDS - start))s)")
    FAILED=1
  fi
}

skip() {
  RESULTS+=("SKIP  $1 (--quick)")
}

# Hash of every file under the given paths, to tell whether a generator changed anything.
tree_hash() {
  find "$@" -type f -print0 2>/dev/null | sort -z | xargs -0 sha256sum 2>/dev/null | sha256sum
}

check_api_client() {
  local before after
  before="$(tree_hash apps/web/src/api)"
  pnpm gen:api || return 1
  after="$(tree_hash apps/web/src/api)"
  if [[ "$before" != "$after" ]]; then
    echo "The typed API client was out of date. It has been regenerated; review and commit apps/web/src/api." >&2
    return 1
  fi
}

check_migrations() {
  local before after
  pnpm exec squawk apps/server/migrations/*.sql || return 1
  before="$(tree_hash apps/server/migrations)"
  pnpm db:generate >/dev/null || return 1
  after="$(tree_hash apps/server/migrations)"
  if [[ "$before" != "$after" ]]; then
    echo "The Drizzle schema has changes with no migration. One was generated in apps/server/migrations; review and commit it." >&2
    return 1
  fi
}

api_tests() {
  bash scripts/infra-up.sh || return 1
  pnpm test:api || return 1
  pnpm check:routes
}

e2e_tests() {
  pnpm exec playwright install --only-shell chromium || return 1
  pnpm test:e2e
}

# The /dev pages (tools, SMS inbox, component gallery) and dev sign-in must not reach a production build.
production_bundle() {
  pnpm build || return 1
  local hits
  # Source maps are skipped: they carry the original source text (including the gated branch), not code that runs.
  hits="$(grep -rlE --exclude='*.map' '/api/dev/|/dev/components|/dev/tools|sign-in-as' apps/web/dist 2>/dev/null || true)"
  if [[ -n "$hits" ]]; then
    echo "Development-only code is in the production build:" >&2
    echo "$hits" >&2
    return 1
  fi
}

secrets_scan() {
  local gitleaks
  gitleaks="$(ensure_tool gitleaks)" || return 1
  "$gitleaks" git --no-banner --redact . || return 1
  # Uncommitted changes too (history alone misses what you are about to commit).
  "$gitleaks" git --no-banner --redact --pre-commit . || return 1
  "$gitleaks" git --no-banner --redact --pre-commit --staged .
}

semgrep_scan() {
  if ! command -v uvx >/dev/null; then
    echo "semgrep needs uv. Install it from https://docs.astral.sh/uv/ and run pnpm verify again." >&2
    return 1
  fi
  uvx "semgrep@${SEMGREP_VERSION}" scan --config p/default --metrics=off --error --quiet
}

gate "Format (prettier)" pnpm format:check
gate "Typecheck" pnpm typecheck
gate "Lint (ESLint, architecture rules)" pnpm lint
gate "Unit and component tests" pnpm test:unit
gate "Domain coverage" pnpm test:coverage
gate "Migrations (squawk, schema in sync)" check_migrations
gate "API tests and route coverage" api_tests
gate "Typed API client up to date" check_api_client
gate "Production bundle has no dev tools" production_bundle
gate "Dependency audit (production)" pnpm audit --prod
gate "Secrets scan (gitleaks)" secrets_scan
if $QUICK; then
  skip "End-to-end tests (Playwright + axe)"
  skip "Mutation tests (Stryker, packages/domain)"
  skip "Static analysis (semgrep)"
else
  gate "End-to-end tests (Playwright + axe)" e2e_tests
  gate "Mutation tests (Stryker, packages/domain)" pnpm test:mutation
  gate "Static analysis (semgrep)" semgrep_scan
fi

printf '\n\033[1mSummary\033[0m\n'
printf '  %s\n' "${RESULTS[@]}"
if [[ $FAILED -ne 0 ]]; then
  echo "Some checks failed. Fix the ones marked FAIL above and run pnpm verify again." >&2
  exit 1
fi
echo "All checks passed."
