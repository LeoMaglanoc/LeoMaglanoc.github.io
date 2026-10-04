#!/bin/sh
set -eu
godot --headless --path godot --script ../tests/mechanics.gd > /tmp/temple-test.log 2>&1 || { cat /tmp/temple-test.log; exit 1; }
cat /tmp/temple-test.log
if grep -Eq 'SCRIPT ERROR|Parse Error|ERROR:|FAIL:' /tmp/temple-test.log; then exit 1; fi
