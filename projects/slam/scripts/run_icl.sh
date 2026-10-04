#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
# Reuse the existing image. Do not build another multi-GB ROS image implicitly.
docker image inspect offline-slam:jazzy >/dev/null
exec docker compose run --rm -T slam bash scripts/run_icl_benchmark_container.sh "$@"
