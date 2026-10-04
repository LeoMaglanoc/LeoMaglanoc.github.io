#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."
scripts/build_android.sh
if ! adb install -r android/app/build/outputs/apk/debug/app-debug.apk; then
  echo "Existing APK uses another debug key; backing up recordings before reinstalling."
  scripts/pull_phone_recordings.sh || true
  adb uninstall com.example.offlineslam
  adb install android/app/build/outputs/apk/debug/app-debug.apk
fi
adb shell am force-stop com.example.offlineslam
adb shell am start -n com.example.offlineslam/.MainActivity
