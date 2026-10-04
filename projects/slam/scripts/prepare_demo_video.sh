#!/usr/bin/env bash
set -euo pipefail

sequence="${1:?usage: prepare_demo_video.sh freiburg3_long_office_household}"
cd "$(dirname "${BASH_SOURCE[0]}")/.."
[[ "$sequence" == "freiburg3_long_office_household" ]] || { echo "No presentation-video source configured for $sequence" >&2; exit 2; }
dataset="data/rgbd_dataset_freiburg3_long_office_household"
avi="$dataset/rgb.avi"
public_dir="web/public/demos/$sequence"
output_dir="outputs/tum_long_office"
depth_preview="$output_dir/depth_preview.avi"
mkdir -p "$dataset" "$public_dir" "$output_dir"
if [[ ! -s "$avi" ]]; then
  curl -fL --retry 3 --retry-delay 2 -o "$avi" "https://cvg.cit.tum.de/rgbd/dataset/freiburg3/rgbd_dataset_freiburg3_long_office_household-rgb.avi"
fi
ffmpeg -y -i "$avi" -c:v libx264 -crf 20 -preset slow -pix_fmt yuv420p -movflags +faststart -an "$public_dir/demo.mp4"
ffprobe -v error -show_entries format=duration,size:stream=codec_name,width,height,r_frame_rate -of json "$public_dir/demo.mp4" > "$output_dir/rgb_video_info.json"
docker compose run --rm -T slam python3 -m slam_pipeline.scripts.prepare_depth_video "$dataset" \
  --output "$depth_preview" --depth-scale 5000 --depth-trunc-m 5 --fps 30
ffmpeg -y -i "$depth_preview" -c:v libx264 -crf 20 -preset slow -pix_fmt yuv420p -movflags +faststart -an "$public_dir/depth.mp4"
ffprobe -v error -show_entries format=duration,size:stream=codec_name,width,height,r_frame_rate -of json "$public_dir/depth.mp4" > "$output_dir/depth_video_info.json"
docker compose run --rm -T slam python3 -m slam_pipeline.scripts.sync_web_video_metadata \
  --metadata "$public_dir/metadata.json" --rgb-info "$output_dir/rgb_video_info.json" --depth-info "$output_dir/depth_video_info.json"
echo "Prepared $public_dir/demo.mp4 and $public_dir/depth.mp4"
