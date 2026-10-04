#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."
mkdir -p data/phone_recordings
if ! adb shell run-as com.example.offlineslam test -d files/recordings; then
  echo "No recorder data exists on the phone yet. Start and stop one recording first." >&2
  exit 0
fi
adb exec-out run-as com.example.offlineslam tar -cf - files/recordings \
  | tar -xf - --strip-components=2 -C data/phone_recordings
echo "Phone recordings copied to data/phone_recordings"
