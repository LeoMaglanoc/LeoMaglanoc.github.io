#!/usr/bin/env bash
# Build the same static /slam/ directory that GitHub Pages publishes, then
# serve the completed _site tree. No host Ruby or Node installation is used.
set -euo pipefail

usage() {
  printf 'Usage: %s [--build-only]\n' "${0##*/}"
}

build_only=false
case "${1:-}" in
  "") ;;
  --build-only) build_only=true ;;
  --help|-h) usage; exit 0 ;;
  *) usage >&2; exit 2 ;;
esac

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
slam_root="$repo_root/vendor/phone-slam"
web_dist="$slam_root/web/dist"
published_slam="_site/slam"

if ! command -v docker >/dev/null 2>&1; then
  printf 'Docker is required for the SLAM preview.\n' >&2
  exit 1
fi

if ! "$build_only" && [[ -n "$(cd "$repo_root" && docker compose ps --status running -q jekyll)" ]]; then
  printf 'Port 8080 is in use by Jekyll. Stop it with: docker compose stop jekyll\n' >&2
  exit 1
fi

(
  cd "$slam_root"
  docker compose run --rm web npm ci
  docker compose run --rm web npm test
  docker compose run --rm web npm run build
  docker compose run --rm web npm run test:assets
)

(
  cd "$repo_root"
  docker compose run --rm --no-deps --entrypoint /bin/sh jekyll \
    -lc 'bundle exec jekyll build'
  docker compose run --rm --no-deps site-tools \
    npx --yes purgecss@6.0.0 -c purgecss.config.js
  docker compose run --rm --no-deps --entrypoint /bin/sh jekyll \
    -lc 'rm -rf _site/slam && \
      mkdir -p _site/slam && \
      cp -R vendor/phone-slam/web/dist/. _site/slam/ && \
      test -f _site/slam/index.html'
)

test -f "$web_dist/index.html"

printf 'SLAM preview built at %s/%s\n' "$repo_root" "$published_slam"
if "$build_only"; then
  exit 0
fi

printf 'Serving http://localhost:8080/slam/ (Ctrl-C to stop)\n'
cd "$repo_root"
exec docker compose up preview
