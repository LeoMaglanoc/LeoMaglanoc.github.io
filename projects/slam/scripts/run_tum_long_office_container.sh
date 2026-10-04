#!/usr/bin/env bash
# Canonical public demo. Ground truth is loaded only by the evaluator after
# RGB-D odometry and RTAB-Map have produced their own trajectory.
set -eo pipefail

cd /workspace
source /opt/ros/jazzy/setup.bash
set -u

dataset="data/rgbd_dataset_freiburg3_long_office_household"
config="config/tum_freiburg3_long_office_household.yaml"
output="outputs/tum_long_office"
mkdir -p "$output"
rm -f "$output/rtabmap.db" "$output/rtabmap.log" "$output/odom.log" \
  "$output/replay_summary.json" "$output/drain_summary.json" "$output/graph_stats.json" "$output/odometry_poses.txt"

python3 -m slam_pipeline.scripts.benchmark_examples "$dataset" --config "$config" --output "$output/examples"

# A dedicated process group makes shutdown deterministic: ros2 launch does not
# otherwise reliably relay SIGINT to both RTAB-Map child nodes in containers.
setsid ros2 launch /workspace/scripts/rtabmap_rgbd_odom.launch.py "database_path:=/workspace/$output/rtabmap.db" > "$output/rtabmap.log" 2>&1 &
rtabmap_pid=$!
python3 -m slam_pipeline.ros.odom_recorder --output "$output/odometry_poses.txt" > "$output/odom.log" 2>&1 &
odom_pid=$!

shutdown() {
  if kill -0 "$odom_pid" 2>/dev/null; then kill -INT "$odom_pid" 2>/dev/null || true; fi
  if kill -0 "$rtabmap_pid" 2>/dev/null; then kill -INT -- "-$rtabmap_pid" 2>/dev/null || true; fi
  wait "$odom_pid" 2>/dev/null || true
  wait "$rtabmap_pid" 2>/dev/null || true
}
trap shutdown EXIT

ready=0
for _ in $(seq 1 90); do
  if ros2 node list 2>/dev/null | grep -qx '/rtabmap' && ros2 node list 2>/dev/null | grep -qx '/rgbd_odometry'; then ready=1; break; fi
  sleep 0.5
done
if [[ "$ready" != 1 ]]; then tail -n 160 "$output/rtabmap.log" >&2 || true; exit 1; fi

# RTAB-Map's RGB-D odometry owns /odom. The player publishes RGB-D only.
python3 -m slam_pipeline.ros.dataset_player "$dataset" --config "$config" --rate 0.5 --publish-odometry false --summary "$output/replay_summary.json"
python3 -m slam_pipeline.scripts.wait_rtabmap "$output/rtabmap.db" --stable-polls 8 --poll-s 1 --timeout-s 240 --output "$output/drain_summary.json"
shutdown
trap - EXIT

python3 -m slam_pipeline.scripts.inspect_rtabmap "$output/rtabmap.db" --output "$output/graph_stats.json"
if [[ "$(python3 -c 'import json; print(json.load(open("outputs/tum_long_office/graph_stats.json"))["global_loop_closure_count"])')" == "0" ]]; then
  echo "No global loop closure was detected; inspect $output/rtabmap.log before accepting this canonical run." >&2
  exit 1
fi
python3 -m slam_pipeline.scripts.evaluate_rtabmap "$dataset" "$output/rtabmap.db" --config "$config" --output "$output/evaluation"
python3 -m slam_pipeline.scripts.crosscheck_evo "$dataset/groundtruth.txt" "$output/evaluation/optimized_trajectory.txt" "$output/evaluation/trajectory_metrics.json" --output "$output/evaluation/evo_crosscheck.json"
# RTAB-Map creates the public mesh and projects the original RGB observations
# into UV texture atlases. The Open3D path remains below as an explicit
# independent baseline, not the browser source.
python3 -m slam_pipeline.scripts.export_rtabmap_textured_mesh "$output/rtabmap.db" --config "$config" --output "$output/rtabmap_textured"
python3 -m slam_pipeline.scripts.reconstruct_tsdf_baseline "$dataset" "$output/rtabmap.db" --config "$config" --output "$output/optimized_tsdf"
python3 -m slam_pipeline.scripts.prepare_rtabmap_textured_web_mesh --output "$output"
