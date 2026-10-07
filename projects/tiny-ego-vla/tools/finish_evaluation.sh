#!/usr/bin/env bash
# Used after the model sweep completes. Existing episodes are checkpoint-hash checked and skipped.
set -euo pipefail
cd "$(dirname "$0")/../../.."
PY=projects/tiny-ego-vla/.venv/bin/python
$PY projects/tiny-ego-vla/tools/check_checkpoints.py
$PY projects/tiny-ego-vla/tools/eval_robot.py
$PY projects/tiny-ego-vla/tools/render_rollouts.py
$PY projects/tiny-ego-vla/tools/export_web.py
node projects/tiny-ego-vla/tests.mjs
