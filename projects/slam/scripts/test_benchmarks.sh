#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."
./scripts/run_tum_xyz.sh
./scripts/run_tum_room.sh
docker compose run --rm slam python3 -m slam_pipeline.scripts.validate_benchmark outputs/tum_xyz
docker compose run --rm slam python3 -m slam_pipeline.scripts.validate_benchmark outputs/tum_room
