#!/bin/bash
set -euxo pipefail

cd "$(dirname "$0")/.."

v="$(scripts/version.ts)"
# Strip the "# Version X.Y.Z" heading (and the blank line below it) so the
# digest line becomes the tag subject / GitHub release title.
sed -e '1d' -e '1{/^$/d;}' "./changelog/$v.md" | git tag -a "$v" -F -
