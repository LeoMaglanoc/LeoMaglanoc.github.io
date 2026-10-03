#!/bin/sh
set -eu
for test in mechanics routes; do
  log="/tmp/scrap-$test.log"
  godot --headless --path godot --script "../tests/$test.gd" --quit-after 600 > "$log" 2>&1 || { cat "$log"; exit 1; }
  cat "$log"
  if grep -Eq 'SCRIPT ERROR|Parse Error|ERROR:|FAIL:' "$log"; then exit 1; fi
done
godot --headless --path godot --quit-after 120 > /tmp/scrap-scene.log 2>&1 || { cat /tmp/scrap-scene.log; exit 1; }
cat /tmp/scrap-scene.log
if grep -Eq 'SCRIPT ERROR|Parse Error|ERROR:' /tmp/scrap-scene.log; then exit 1; fi
