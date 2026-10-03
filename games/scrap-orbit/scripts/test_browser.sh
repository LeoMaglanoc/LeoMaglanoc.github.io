#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
docker compose up -d preview
docker compose run --rm browser npm ci --ignore-scripts
docker compose run --rm browser
