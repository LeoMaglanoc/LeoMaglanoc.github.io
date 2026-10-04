#!/bin/sh
set -eu
mkdir -p ../../assets/interactive/block-world
# Capture engine diagnostics: Godot sometimes exits 0 even on script errors.
godot --headless --path godot --editor --import > /tmp/robot-import.log 2>&1 || { cat /tmp/robot-import.log; exit 1; }
cat /tmp/robot-import.log
if grep -Eq 'SCRIPT ERROR|Parse Error|ERROR:' /tmp/robot-import.log; then exit 1; fi
godot --headless --path godot --export-release Web ../../../assets/interactive/block-world/index.html > /tmp/robot-export.log 2>&1 || { cat /tmp/robot-export.log; exit 1; }
cat /tmp/robot-export.log
if grep -Eq 'SCRIPT ERROR|Parse Error|ERROR:' /tmp/robot-export.log; then exit 1; fi
# Keep engine license notices alongside every web build.
curl -fsSL https://raw.githubusercontent.com/godotengine/godot/4.7.2-stable/LICENSE.txt -o ../../assets/interactive/block-world/ENGINE-LICENSE.txt
curl -fsSL https://raw.githubusercontent.com/godotengine/godot/4.7.2-stable/COPYRIGHT.txt -o ../../assets/interactive/block-world/GODOT-THIRD-PARTY-NOTICES.txt
# The engine inserts whitespace for empty head includes; keep generated HTML clean.
python3 - <<'PYHTML'
from pathlib import Path
p = Path('../../assets/interactive/block-world/index.html')
p.write_text('\n'.join(line.rstrip() for line in p.read_text().splitlines()).rstrip() + '\n')
PYHTML
