#!/usr/bin/env bash
# pre-commit: refuse a commit whose staged changes contain a secret (gitleaks, pinned + checksummed).
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/tools.sh
gitleaks="$(ensure_tool gitleaks)"
if ! "$gitleaks" git --no-banner --redact --pre-commit --staged --log-level warn .; then
  echo "This commit contains what looks like a secret. Remove it from the staged files and commit again." >&2
  exit 1
fi
