#!/usr/bin/env bash
# Pre-commit: typecheck only the workspace packages touched by this commit (and their dependents).
set -euo pipefail
if git rev-parse --verify --quiet HEAD >/dev/null; then
  pnpm --filter "...[HEAD]" run --if-present typecheck
else
  # First commit: nothing to diff against, so check everything.
  pnpm -r run --if-present typecheck
fi
