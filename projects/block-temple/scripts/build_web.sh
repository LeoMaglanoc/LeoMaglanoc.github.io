#!/bin/sh
set -eu
mkdir -p ../../assets/interactive/block-temple
# Capture engine diagnostics: Godot sometimes exits 0 even on script errors.
godot --headless --path godot --editor --import > /tmp/temple-import.log 2>&1 || { cat /tmp/temple-import.log; exit 1; }
cat /tmp/temple-import.log
if grep -Eq 'SCRIPT ERROR|Parse Error|ERROR:' /tmp/temple-import.log; then exit 1; fi
godot --headless --path godot --export-release Web ../../../assets/interactive/block-temple/index.html > /tmp/temple-export.log 2>&1 || { cat /tmp/temple-export.log; exit 1; }
cat /tmp/temple-export.log
if grep -Eq 'SCRIPT ERROR|Parse Error|ERROR:' /tmp/temple-export.log; then exit 1; fi
# Keep engine license notices alongside every web build.
curl -fsSL https://raw.githubusercontent.com/godotengine/godot/4.7.2-stable/LICENSE.txt -o ../../assets/interactive/block-temple/ENGINE-LICENSE.txt
curl -fsSL https://raw.githubusercontent.com/godotengine/godot/4.7.2-stable/COPYRIGHT.txt -o ../../assets/interactive/block-temple/GODOT-THIRD-PARTY-NOTICES.txt
# The engine inserts whitespace for empty head includes; keep generated HTML clean.
python3 - <<'PYHTML'
from pathlib import Path
p = Path('../../assets/interactive/block-temple/index.html')
p.write_text('\n'.join(line.rstrip() for line in p.read_text().splitlines()).rstrip() + '\n')
PYHTML
