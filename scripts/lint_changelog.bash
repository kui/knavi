#!/bin/bash

set -euo pipefail

cd "$(dirname "$0")/.."

main() {
  local v file
  v="$(scripts/version.ts)"
  file="changelog/$v.md"
  ensure_file_exists "$v" "$file"
  should_start_with_version_header "$v" "$file"
  should_have_digest_before_bullets "$file"
}

ensure_file_exists() {
  local v="$1" file="$2"
  if ! [[ -f "$file" ]]; then
    echo "# Version $v" > "$file"
    echo "$file did not exist; created it"
    exit 1
  fi
}

should_start_with_version_header() {
  local v="$1" file="$2"
  if head -n1 "$file" | grep -vq "^# Version $v$"; then
    echo "$file does not start with the correct version header"
    exit 1
  fi
}

# The line right after the version header becomes the git tag subject (and
# therefore the GitHub release title). Require a non-bullet digest line there
# whenever bullets exist; otherwise the first bullet ends up as the title.
should_have_digest_before_bullets() {
  local file="$1"
  local third
  third=$(sed -n '3p' "$file")
  if [[ "$third" == -* ]]; then
    local tmp
    tmp=$(mktemp)
    {
      sed -n '1,2p' "$file"
      echo "TODO: write a one-line release digest"
      echo
      sed -n '3,$p' "$file"
    } > "$tmp"
    mv "$tmp" "$file"
    echo "$file was missing a digest line; inserted a TODO placeholder"
    exit 1
  fi
}

main
