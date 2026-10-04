#!/usr/bin/env bash
set -euo pipefail

sequence="${1:?usage: run_tum_benchmark.sh xyz|room|freiburg3_long_office_household}"
cd "$(dirname "${BASH_SOURCE[0]}")/.."
docker compose build slam
docker compose run --rm slam bash /workspace/scripts/run_tum_benchmark_container.sh "${sequence}"
