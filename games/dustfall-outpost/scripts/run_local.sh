#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ "${1:-}" == "--site" ]]; then
  website_root="$(cd ../.. && pwd)"
  docker run --rm --entrypoint bundle -v "$website_root:/srv/jekyll" -w /srv/jekyll \
    amirpourmand/al-folio:v0.14.7 exec jekyll build \
    --destination /srv/jekyll/games/dustfall-outpost/artifacts/site
  docker compose up -d site-preview
  printf '%s\n' 'Portfolio preview: http://localhost:8094/dustfall-outpost/'
else
  docker compose up -d preview
  printf '%s\n' 'Game preview: http://localhost:8093/assets/interactive/dustfall-outpost/'
fi
