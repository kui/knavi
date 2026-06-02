#!/bin/bash
set -euxo pipefail

cd "$(dirname "$0")/.."

v="$(scripts/version.ts)"
git tag -a "$v" -F "./changelog/$v.md"
