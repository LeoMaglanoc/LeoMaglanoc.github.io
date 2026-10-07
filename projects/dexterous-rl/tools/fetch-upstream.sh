#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p vendor
if [ ! -d vendor/wuji-mjlab ]; then
 git clone --branch v2026.9.27 --depth 1 https://github.com/wuji-technology/wuji-mjlab.git vendor/wuji-mjlab
fi
test "$(git -C vendor/wuji-mjlab rev-parse HEAD)" = "26b99c6338641e8edc17caf87922e6e1767121fa"
