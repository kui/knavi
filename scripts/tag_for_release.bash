#!/bin/bash
set -eux

cd "$(dirname "$0")/.."

v="$(node -e 'console.log(require("./package.json").version)')"
git tag -a "$v" -F "./changelog/$v.md"
