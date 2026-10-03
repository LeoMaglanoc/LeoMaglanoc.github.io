#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
docker compose up -d preview
docker compose run --rm browser sh -c 'npm ci --no-audit --no-fund && node tests/browser.cjs'
