#!/bin/bash
set -eux
git tag $(node -e 'console.log(require("./package.json").version)')
