#!/usr/bin/env bash
# Used after the model sweep completes. Existing episodes are checkpoint-hash checked and skipped.
set -euo pipefail
cd "$(dirname "$0")/../../.."
TINY_EGO_NODE=${TINYEGO_NODE:-node}
"$TINY_EGO_NODE" -e 'if (Number(process.versions.node.split(".")[0]) < 18) { console.error("Node 18+ required; set TINYEGO_NODE to its executable path."); process.exit(1); }'
PY=projects/tiny-ego-vla/.venv/bin/python
$PY projects/tiny-ego-vla/tools/check_checkpoints.py
$PY projects/tiny-ego-vla/tools/eval_robot.py
$PY projects/tiny-ego-vla/tools/audit_rollouts.py
$PY projects/tiny-ego-vla/tools/render_rollouts.py
$PY projects/tiny-ego-vla/tools/export_web.py
$PY projects/tiny-ego-vla/tools/audit_media.py
"$TINY_EGO_NODE" projects/tiny-ego-vla/tests.mjs
