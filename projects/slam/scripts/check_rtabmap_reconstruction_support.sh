#!/usr/bin/env bash
# Print the exact native reconstruction capabilities available in the SLAM image.
set -eo pipefail
source /opt/ros/jazzy/setup.bash
set -u
for command in rtabmap-export rtabmap-info; do
  command -v "$command" >/dev/null || { echo "Missing required command: $command" >&2; exit 1; }
done

support="$(rtabmap-export --version 2>&1 || true)"
help="$(rtabmap-export --help 2>&1 || true)"
printf '%s\n' "$support"
printf '\nRelevant rtabmap-export options:\n'
printf '%s\n' "$help" | grep -E -- '--(mesh|texture|gain|no_blending|multiband|poisson|voxel|max_polygons|decimation|edge_bleeding|texture_)' || true

if grep -q 'With Alice Vision:[[:space:]]*true' <<<"$support"; then
  echo 'AliceVision multi-band texturing: available'
else
  echo 'AliceVision multi-band texturing: unavailable (standard native gain-compensated blending remains available)'
fi
