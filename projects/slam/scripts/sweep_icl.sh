#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
exec docker compose run --rm -T slam bash -c 'source /opt/ros/jazzy/setup.bash; export OMP_NUM_THREADS=4 OPENBLAS_NUM_THREADS=2; python3 -u -m slam_pipeline.scripts.icl_sweep'
