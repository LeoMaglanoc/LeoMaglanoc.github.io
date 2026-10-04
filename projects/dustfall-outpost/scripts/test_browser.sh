#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
docker compose up -d preview
docker compose run --rm browser npm ci --ignore-scripts
if [[ "${1:-}" == "--gpu" ]]; then
  docker compose -f docker-compose.yml -f docker-compose.gpu.yml run --rm browser node tests/browser.cjs
else
  docker compose run --rm browser
fi
