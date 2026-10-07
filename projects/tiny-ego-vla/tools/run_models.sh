#!/usr/bin/env bash
# Finite CPU jobs; feature extraction must have completed first.
set -euo pipefail
cd "$(dirname "$0")/../../.."
PY=projects/tiny-ego-vla/.venv/bin/python
$PY projects/tiny-ego-vla/tools/audit_data.py
$PY projects/tiny-ego-vla/tools/train_ego.py --resume
$PY projects/tiny-ego-vla/tools/train_robot_bc.py --resume
$PY projects/tiny-ego-vla/tools/check_checkpoints.py
