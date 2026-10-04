#!/bin/sh
set -eu
godot --headless --path godot --script ../tests/mechanics.gd > /tmp/robot-test.log 2>&1 || { cat /tmp/robot-test.log; exit 1; }
cat /tmp/robot-test.log
if grep -Eq 'SCRIPT ERROR|Parse Error|ERROR:|FAIL:' /tmp/robot-test.log; then exit 1; fi
