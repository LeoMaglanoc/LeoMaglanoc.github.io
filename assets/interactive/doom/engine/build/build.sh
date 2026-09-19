#!/usr/bin/env bash
set -euo pipefail

# Rebuild the Tomb-compatible GZDoom fork plus only the local RL bridge.
# Tomb's public checkout supplies its detailed WebGL patch inventory but not
# the fork/source patch series. The source checkout must therefore be supplied
# explicitly; stock public GZDoom is never silently substituted.
root=/workspace/assets/interactive/doom
source_dir=/tmp/gzdoom-build
patch="$root/engine/patches/0001-browser-rl-bridge.patch"
build_dir=/tmp/gzdoom-build-output
out_dir=${GZDOOM_OUTPUT_DIR:-"$root/engine/custom"}
revision=6ce809efe2902e43ceaa7031b875225d3a0367de

if [[ -z "${TOMB_GZDOOM_SOURCE_DIR:-}" ]]; then
  echo "TOMB_GZDOOM_SOURCE_DIR is required for a browser build." >&2
  echo "Supply the Tomb-compatible g4.11.3 fork; its public wrapper only contains a patch inventory." >&2
  exit 2
fi

test -d "$TOMB_GZDOOM_SOURCE_DIR/.git"
rm -rf "$source_dir" "$build_dir"
git clone --no-local "$TOMB_GZDOOM_SOURCE_DIR" "$source_dir"
git -C "$source_dir" merge-base --is-ancestor "$revision" HEAD
git -C "$source_dir" apply --check "$patch"
git -C "$source_dir" apply "$patch"

cmake -S "$source_dir/tools/re2c" -B /tmp/gzdoom-host-re2c -G Ninja -DCMAKE_BUILD_TYPE=Release
cmake --build /tmp/gzdoom-host-re2c --parallel
cmake -S "$source_dir/tools/lemon" -B /tmp/gzdoom-host-lemon -G Ninja -DCMAKE_BUILD_TYPE=Release
cmake --build /tmp/gzdoom-host-lemon --parallel
export PATH="/tmp/gzdoom-host-re2c:/tmp/gzdoom-host-lemon:$PATH"

emcmake cmake -S "$source_dir" -B "$build_dir" -G Ninja \
  -DCMAKE_BUILD_TYPE=Release -DDYN_OPENAL=OFF -DDYN_FLUIDSYNTH=OFF \
  -DDYN_SNDFILE=OFF -DNO_OPENAL=OFF \
  -DCMAKE_EXE_LINKER_FLAGS_RELEASE='-sJSPI=1'
cp "$source_dir/tools/lemon/lempar.c" "$build_dir/src/lempar.c"
cmake --build "$build_dir" --parallel
mkdir -p "$out_dir"
install -m 0644 "$build_dir/gzdoom.js" "$build_dir/gzdoom.wasm" "$out_dir/"
install -m 0644 "$root/doom.worker.js" "$out_dir/doom.worker.js"
