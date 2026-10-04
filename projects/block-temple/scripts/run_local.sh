#!/bin/sh
set -eu
cd "$(dirname "$0")/../../.."
exec python3 -m http.server "${PORT:-8099}" --bind 127.0.0.1
