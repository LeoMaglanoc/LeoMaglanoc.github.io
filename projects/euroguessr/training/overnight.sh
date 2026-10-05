#!/usr/bin/env bash
# Run manually; no automatic background schedule or paid compute.
set -euo pipefail
cd "$(dirname "$0")/.."
PYTHON=".venv/bin/python"
if [[ ! -x "$PYTHON" ]]; then
  python3 -m venv .venv
  "$PYTHON" -m pip install -r requirements.txt
fi
RUN_DIR="artifacts/overnight"
mkdir -p "$RUN_DIR"
if [[ ! -f "$RUN_DIR/manifest.json" ]]; then
  "$PYTHON" training/prepare.py --train 12000 --test 600 --workers 6 2>&1 | tee "$RUN_DIR/prepare.log"
  cp data/manifest.json "$RUN_DIR/manifest.json"
fi
if [[ -f "$RUN_DIR/last.pt" ]]; then
  "$PYTHON" training/train.py --manifest "$RUN_DIR/manifest.json" --run-dir "$RUN_DIR" --resume --finetune --epochs 40 --threads 2 --export 2>&1 | tee -a "$RUN_DIR/train.log"
else
  "$PYTHON" training/train.py --manifest "$RUN_DIR/manifest.json" --run-dir "$RUN_DIR" --warm-start checkpoints/current/best.pt --finetune --epochs 40 --threads 2 --export 2>&1 | tee -a "$RUN_DIR/train.log"
fi
# Refresh asset manifest and published copies only after successful export.
"$PYTHON" training/register_assets.py
"$PYTHON" ../../scripts/publish-project-assets.py
printf 'Finished. Review models/metadata.json and test in Chrome before committing.\n'
