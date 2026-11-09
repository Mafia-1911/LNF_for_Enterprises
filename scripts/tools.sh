#!/usr/bin/env bash
# Downloads pinned, checksum-verified command-line tools into .tools/bin (git-ignored).
# Usage: source scripts/tools.sh; ensure_tool age   →   prints the path to the binary.
# Free, open-source releases from GitHub; nothing is installed system-wide.
set -euo pipefail

TOOLS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/.tools"

ensure_tool() {
  local name="$1" version url sha bin
  case "$name" in
    age)
      version="1.3.2"
      url="https://github.com/FiloSottile/age/releases/download/v${version}/age-v${version}-linux-amd64.tar.gz"
      sha="cbe24006683f8eb669266162894b9a522a1af52f2665fbc63a4bb032ed26ac10"
      bin="age" ;;
    age-keygen)
      ensure_tool age >/dev/null
      echo "${TOOLS_DIR}/age-1.3.2/age/age-keygen"
      return ;;
    gitleaks)
      version="8.30.1"
      url="https://github.com/gitleaks/gitleaks/releases/download/v${version}/gitleaks_${version}_linux_x64.tar.gz"
      sha="551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb"
      bin="gitleaks" ;;
    *) echo "Unknown tool: $name" >&2; return 1 ;;
  esac
  if [[ "$(uname -sm)" != "Linux x86_64" ]]; then
    command -v "$bin" >/dev/null && { command -v "$bin"; return; }
    echo "Install $name $version for your platform and put it on PATH." >&2; return 1
  fi
  local dir="${TOOLS_DIR}/${name}-${version}"
  local path
  path="$(find "$dir" -type f -name "$bin" 2>/dev/null | head -1 || true)"
  if [[ -z "$path" ]]; then
    mkdir -p "$dir"
    local archive="${dir}/download.tar.gz"
    curl -fsSL -o "$archive" "$url"
    if ! echo "${sha}  ${archive}" | sha256sum -c --status; then
      rm -rf "$dir"
      echo "Checksum mismatch for $name $version; refusing to use it." >&2
      return 1
    fi
    tar -xzf "$archive" -C "$dir"
    rm -f "$archive"
    path="$(find "$dir" -type f -name "$bin" | head -1)"
  fi
  echo "$path"
}
