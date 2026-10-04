#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."
docker compose build android
if [[ ! -f android/debug.keystore ]]; then
  docker compose run --rm android keytool -genkeypair -v \
    -keystore /workspace/android/debug.keystore -storepass android \
    -alias androiddebugkey -keypass android -keyalg RSA -keysize 2048 \
    -validity 10000 -dname "CN=Android Debug,O=Offline SLAM,C=US"
fi
docker compose run --rm android gradle --no-daemon :app:assembleDebug
