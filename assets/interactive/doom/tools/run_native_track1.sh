#!/usr/bin/env bash
set -euo pipefail

: "${ARNOLD_DIR:?The Docker image must provide ARNOLD_DIR}"
cd "$ARNOLD_DIR"

mkdir -p /workspace/assets/interactive/doom/artifacts/native

echo "Running the upstream Track-1 command in Xvfb (AI + 10 built-in bots)."
echo "Use Ctrl-C to end an interactive inspection. Logs are written by Arnold."
exec xvfb-run -a -s "-screen 0 1280x720x24" \
  ./run.sh track1 --n_bots 10
