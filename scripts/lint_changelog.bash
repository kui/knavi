#!/bin/bash

set -euo pipefail

cd "$(dirname "$0")/.."

main() {
  has_current_version_chengelog
  for file in changelog/*.md; do
    should_start_with_version_header "$file"
  done
}

has_current_version_chengelog() {
  local v="$(scripts/version.js)"
  if ! [[ -f "changelog/$v.md" ]]; then
    echo "changelog/$v.md does not exist"
    exit 1
  fi
}

should_start_with_version_header() {
  local file="$1"
  local v=$(basename "$file" .md)
  if head -n1 "$file" | grep -vq "^# Version $v$"; then
    echo "changelog/$v.md does not start with the correct version header"
    exit 1
  fi
}

main
