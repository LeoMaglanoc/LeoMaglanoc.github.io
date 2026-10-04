#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
command -v blender >/dev/null
blender --background --python-exit-code 1 --python blender/generate.py
python3 scripts/generate_audio.py
if [[ "${1:-}" == "--previews" ]]; then blender --background --python-exit-code 1 --python blender/render_preview.py; fi
