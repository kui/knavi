#!/bin/bash
set -euxo pipefail

cd "$(dirname "$0")/.."

v="$(scripts/version.ts)"
f="./changelog/$v.md"
if [[ ! -f "$f" ]]; then
  echo "$f does not exist; run 'npm run changelog' in a release PR first" >&2
  exit 1
fi
if sed -n 3p "$f" | grep -q '^TODO:'; then
  echo "$f still has the TODO digest on line 3" >&2
  exit 1
fi
if find changelog/unreleased -name '*.md' ! -name README.md 2>/dev/null | grep -q .; then
  echo "changelog/unreleased has fragments not built into $f" >&2
  exit 1
fi
# WHY: strip the "# Version X.Y.Z" heading (and the blank line below it) so the digest line becomes the tag subject / GitHub release title.
sed -e '1d' -e '1{/^$/d;}' "$f" | git tag -a "$v" -F -
