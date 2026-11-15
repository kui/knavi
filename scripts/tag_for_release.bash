#!/bin/bash
set -euxo pipefail

cd "$(dirname "$0")/.."

v="$(scripts/version.ts)"
f="./changelog/$v.md"
if [[ ! -f "$f" ]]; then
  echo "$f does not exist; run 'npm run changelog' in a release PR first" >&2
  exit 1
fi
# WHY: line 3 becomes the tag subject (GitHub release title), so it must be a hand-written digest, not the placeholder, a bullet, or empty.
if ! sed -n 3p "$f" | grep -qv -e '^TODO:' -e '^-' -e '^$'; then
  echo "$f: write a one-line release digest on line 3" >&2
  exit 1
fi
if find changelog/unreleased -name '*.md' ! -name README.md 2>/dev/null | grep -q .; then
  echo "changelog/unreleased has fragments not built into $f" >&2
  exit 1
fi
# WHY: strip the "# Version X.Y.Z" heading (and the blank line below it) so the digest line becomes the tag subject / GitHub release title.
sed -e '1d' -e '1{/^$/d;}' "$f" | git tag -a "$v" -F -
