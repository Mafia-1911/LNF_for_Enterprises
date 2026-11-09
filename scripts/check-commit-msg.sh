#!/usr/bin/env bash
# Rejects commit messages that are not Conventional Commits, e.g. "feat(items): add lost report route".
set -euo pipefail
msg_file="$1"
first_line="$(head -n1 "$msg_file")"
pattern='^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\([a-z0-9._/-]+\))?!?: .{1,100}$'
if [[ "$first_line" =~ $pattern ]] || [[ "$first_line" =~ ^Merge\  ]] || [[ "$first_line" =~ ^Revert\  ]]; then
  exit 0
fi
echo "Commit message must follow Conventional Commits, e.g. 'feat(items): add lost report route'." >&2
echo "Got: $first_line" >&2
exit 1
