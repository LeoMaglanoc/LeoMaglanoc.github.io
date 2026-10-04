#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
./scripts/build_web.sh --assets
python3 - <<'PY'
from pathlib import Path
import struct
expected='building workshop gate stall tower tank generator pipe ship wreck crate barrel rock cliff robot power_cell navigation_module coolant_unit'.split()
for name in expected:
    p=Path('godot/assets/generated')/(name+'.glb')
    magic,version,length=struct.unpack('<4sII',p.read_bytes()[:12])
    assert magic==b'glTF' and version==2 and length==p.stat().st_size, p
for name in ['game.html','game.js','game.wasm','game.pck','game.audio.worklet.js','game.audio.position.worklet.js','index.html']:
    p=Path('../../assets/interactive/dustfall-outpost')/name
    assert p.is_file() and p.stat().st_size>0, p
print('18 generated GLBs and web output validated')
PY
godot --headless --path godot --script ../tests/objective.gd 2>&1 | tee /tmp/dustfall-objective.log
godot --headless --path godot --quit-after 90 2>&1 | tee /tmp/dustfall-scene.log
if grep -Eq 'SCRIPT ERROR|Parse Error|ERROR:' /tmp/dustfall-objective.log /tmp/dustfall-scene.log; then exit 1; fi
printf '%s\n' 'Build, objective and main-scene validation passed.'
