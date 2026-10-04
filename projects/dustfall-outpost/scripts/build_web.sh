#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
command -v godot >/dev/null
if [[ "${1:-}" == "--assets" ]]; then ./scripts/build_assets.sh; fi
mkdir -p ../../assets/interactive/dustfall-outpost
godot --headless --path godot --editor --import 2>&1 | tee /tmp/dustfall-import.log
if grep -Eq 'SCRIPT ERROR|Parse Error|ERROR:' /tmp/dustfall-import.log; then exit 1; fi
godot --headless --path godot --export-release Web ../../../assets/interactive/dustfall-outpost/game.html 2>&1 | tee /tmp/dustfall-export.log
if grep -Eq 'SCRIPT ERROR|Parse Error|ERROR:' /tmp/dustfall-export.log; then exit 1; fi
