#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
if [ "${1:-}" = "--site" ]; then
  website_root="$(cd ../.. && pwd)"
  docker run --rm --entrypoint bundle -v "$website_root:/srv/jekyll" -w /srv/jekyll \
    amirpourmand/al-folio:v0.14.7 exec jekyll build \
    --destination /srv/jekyll/projects/block-world/artifacts/site
  docker compose up -d site-preview
  printf '%s\n' 'Portfolio preview: http://localhost:8098/block-world/'
else
  docker compose up -d preview
  printf '%s\n' 'Game preview: http://localhost:8097/assets/interactive/block-world/index.html'
fi
