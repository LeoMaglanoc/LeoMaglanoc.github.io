#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)
ENGINE_DIR="$ROOT_DIR/assets/interactive/slam/engine"
APP_ASSETS="$ROOT_DIR/assets/interactive/slam/app/assets"
UPSTREAM_URL="https://github.com/alanross/AlvaAR.git"
UPSTREAM_REF="7796af500ee92001ac2a9888363ff64d7a3bee75"
BUILD_DIR="${ALVAAR_BUILD_DIR:-${TMPDIR:-/tmp}/alvaar-build}"

if ! command -v emcc >/dev/null 2>&1; then
  echo "emcc was not found. Activate the Emscripten SDK before running this script." >&2
  exit 1
fi

if [[ -e "$BUILD_DIR" ]]; then
  echo "Build directory already exists: $BUILD_DIR" >&2
  echo "Set ALVAAR_BUILD_DIR to a fresh directory or remove that generated directory." >&2
  exit 1
fi

mkdir -p "$BUILD_DIR"
git clone --filter=blob:none "$UPSTREAM_URL" "$BUILD_DIR/AlvaAR"
git -C "$BUILD_DIR/AlvaAR" checkout --detach "$UPSTREAM_REF"
git -C "$BUILD_DIR/AlvaAR" apply "$ENGINE_DIR/alvaar.patch"

# The upstream build predates current Emscripten and assumes a local macOS SDK.
# Keep these compatibility edits here so the checked-in patch stays focused on
# the runtime API extension.
UPSTREAM_DIR="$BUILD_DIR/AlvaAR"
sed -i 's#EMSCRIPTEN_DIR=~/Development/emsdk/upstream/emscripten#EMSCRIPTEN_DIR=$(dirname "$(command -v emcc)")#' \
  "$UPSTREAM_DIR/src/libs/build.sh"
sed -i 's/^  python /  python3 /' "$UPSTREAM_DIR/src/libs/build.sh"
sed -i '58i\    -DBUILD_TESTING=OFF \\' \
  "$UPSTREAM_DIR/src/libs/build.sh"
sed -i 's/-march=[^ )]*//g' \
  "$UPSTREAM_DIR/src/libs/obindex2/lib/CMakeLists.txt" \
  "$UPSTREAM_DIR/src/libs/ibow_lcd/CMakeLists.txt" \
  "$UPSTREAM_DIR/src/libs/opengv/CMakeLists.txt" \
  "$UPSTREAM_DIR/src/libs/build.sh"
sed -i 's/ --memory-init-file 0//' \
  "$UPSTREAM_DIR/src/libs/opencv/modules/js/CMakeLists.txt"
sed -i '/^add_subdirectory(scripts EXCLUDE_FROM_ALL)$/c\if(BUILD_TESTING)\n  add_subdirectory(scripts EXCLUDE_FROM_ALL)\nendif()' \
  "$UPSTREAM_DIR/src/libs/eigen/CMakeLists.txt"
sed -i "s|sed -i ''|sed -i|" \
  "$UPSTREAM_DIR/src/libs/build.sh"

pushd "$BUILD_DIR/AlvaAR/src/libs" >/dev/null
./build.sh
popd >/dev/null

pushd "$BUILD_DIR/AlvaAR/src/slam" >/dev/null
mkdir build
pushd build >/dev/null
emcmake cmake .. -DCMAKE_BUILD_TYPE=Release -DDIST_DIR="$APP_ASSETS"
emmake make -j2 install
popd >/dev/null
popd >/dev/null

test -s "$APP_ASSETS/alva_ar.js"
echo "Wrote patched runtime: $APP_ASSETS/alva_ar.js"
