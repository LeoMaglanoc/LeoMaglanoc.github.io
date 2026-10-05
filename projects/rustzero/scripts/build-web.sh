#!/bin/sh
set -eu
cargo build --locked --release --target wasm32-unknown-unknown --lib -j 3
wasm-bindgen "$CARGO_TARGET_DIR/wasm32-unknown-unknown/release/rustzero.wasm" --target web --out-dir web/pkg --no-typescript
