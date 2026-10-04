#!/usr/bin/env bash
set -eo pipefail
cd /workspace
source /opt/ros/jazzy/setup.bash
set -u
# Bound CPU threading to keep ROS replay responsive and memory usage predictable.
export OMP_NUM_THREADS=4 OPENBLAS_NUM_THREADS=2
exec python3 -u -m slam_pipeline.scripts.icl_benchmark "$@"
