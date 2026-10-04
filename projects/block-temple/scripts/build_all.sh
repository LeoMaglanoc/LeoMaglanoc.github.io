#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
BLENDER_BIN="${BLENDER_BIN:-blender}"
GODOT_BIN="${GODOT_BIN:-godot}"
mkdir -p artifacts ../../assets/interactive/block-temple
run_blender() {
  local task="$1"; shift
  "$BLENDER_BIN" "$@" > "artifacts/$task.log" 2>&1
  cat "artifacts/$task.log"
  if rg -q 'Traceback|AssertionError|Error: Python' "artifacts/$task.log"; then exit 1; fi
}
run_blender build --background --python blender/scripts/build_modules.py
run_blender assets blender/coruscant_temple.blend --background --python blender/scripts/validate_scene.py --python blender/scripts/export_glb.py
if [ "${RENDER_CHECKS:-1}" = 1 ]; then
  run_blender renders blender/coruscant_temple.blend --background --python blender/scripts/render_checks.py
  python3 scripts/package_preview.py
fi
"$GODOT_BIN" --headless --path godot --editor --import > artifacts/import.log 2>&1
if rg -q 'SCRIPT ERROR|Parse Error|ERROR:' artifacts/import.log; then cat artifacts/import.log; exit 1; fi
"$GODOT_BIN" --headless --path godot --script ../tests/mechanics.gd > artifacts/mechanics.log 2>&1
cat artifacts/mechanics.log
if rg -q 'SCRIPT ERROR|Parse Error|ERROR:|FAIL:' artifacts/mechanics.log; then exit 1; fi
"$GODOT_BIN" --headless --path godot --export-release Web ../../../assets/interactive/block-temple/index.html > artifacts/export.log 2>&1
if rg -q 'SCRIPT ERROR|Parse Error|ERROR:' artifacts/export.log; then cat artifacts/export.log; exit 1; fi
cp ../../assets/interactive/block-world/{ENGINE-LICENSE.txt,GODOT-THIRD-PARTY-NOTICES.txt} ../../assets/interactive/block-temple/
printf '%s\n' 'PASS: temple built, validated and exported'
node tests/shell.cjs
printf '%s\n' 'Chrome computer-use validation: see VALIDATION.md for the route and responsive checks.'
