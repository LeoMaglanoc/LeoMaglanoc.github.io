#!/usr/bin/env bash
set -euo pipefail

sequence="${1:?usage: run_tum.sh freiburg1_xyz|freiburg1_room|freiburg3_long_office_household}"
cd "$(dirname "${BASH_SOURCE[0]}")/.."
case "$sequence" in
  freiburg3_long_office_household|long_office) exec ./scripts/run_tum_long_office.sh ;;
  freiburg1_xyz|xyz) exec ./scripts/run_tum_benchmark.sh xyz ;;
  freiburg1_room|room) exec ./scripts/run_tum_benchmark.sh room ;;
  *) echo "Unknown TUM sequence: $sequence" >&2; exit 2 ;;
esac
