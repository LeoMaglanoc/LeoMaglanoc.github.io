#!/usr/bin/env bash
set -euo pipefail

recording="${1:?usage: run_phone_rtabmap.sh data/phone_recordings/<recording> [output_dir]}"
output="${2:-outputs/phone_rtabmap}"
cd "$(dirname "${BASH_SOURCE[0]}")/.."
[[ -f "${recording}/manifest.json" ]] || { echo "missing phone recording manifest: ${recording}" >&2; exit 2; }
mkdir -p "${output}"
docker compose build slam
docker compose run --rm slam bash -lc '
  set -eo pipefail
  source /opt/ros/jazzy/setup.bash
  set -u
  recording="$1"; output="$2"
  rm -f "$output/rtabmap.db" "$output/rtabmap.log"
  ros2 launch /workspace/scripts/rtabmap_tum.launch.py "database_path:=/workspace/$output/rtabmap.db" > "$output/rtabmap.log" 2>&1 &
  pid=$!
  stop() { kill -INT "$pid" 2>/dev/null || true; wait "$pid" 2>/dev/null || true; }
  trap stop EXIT
  for _ in $(seq 1 60); do ros2 node list 2>/dev/null | grep -qx /rtabmap && break; sleep 0.5; done
  python3 -m slam_pipeline.ros.dataset_player "$recording" --config config/phone_default.yaml --rate 1.0 --summary "$output/replay_summary.json"
  python3 -m slam_pipeline.scripts.wait_rtabmap "$output/rtabmap.db" --output "$output/drain_summary.json"
  stop; trap - EXIT
  python3 -m slam_pipeline.scripts.inspect_rtabmap "$output/rtabmap.db" --output "$output/graph_stats.json"
  python3 -m slam_pipeline.scripts.reconstruct_phone "$recording" --config config/phone_default.yaml --output "$output/arcore_tsdf"
  python3 -m slam_pipeline.scripts.reconstruct_rtabmap "$recording" "$output/rtabmap.db" --config config/phone_default.yaml --output "$output/optimized_tsdf"
' bash "${recording}" "${output}"
