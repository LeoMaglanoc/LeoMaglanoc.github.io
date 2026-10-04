#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
exec docker compose run --rm -T slam python3 -m slam_pipeline.scripts.download_icl "${1:?usage: download_icl_nuim.sh lr_kt0|lr_kt1|lr_kt2|lr_kt3}"
