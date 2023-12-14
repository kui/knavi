#!/bin/bash
set -euxo pipefail

cd "$(dirname "$0")/.."

v="$(scripts/version.js)"
git tag -a "$v" -F "./changelog/$v.md"
