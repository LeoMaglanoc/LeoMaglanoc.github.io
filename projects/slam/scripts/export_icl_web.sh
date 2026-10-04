#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
docker compose run --rm -T slam bash -c 'source /opt/ros/jazzy/setup.bash; export OMP_NUM_THREADS=4; python3 -u -m slam_pipeline.scripts.icl_web_export'
docker compose run --rm -T web npm ci
for poses in estimated gt; do
  docker compose run --rm -T web npx --no-install obj2gltf \
    -i "/workspace/outputs/icl_nuim/lr_kt0/web_textures/rtab_${poses}/aligned.obj" \
    -o "/workspace/web/public/demos/icl_nuim/rtab_${poses}_textured.glb" -b
done
docker compose run --rm -T web node scripts/finalize-icl-assets.mjs
# Container exports are owned by root; make the published bundle editable locally.
task_uid="$(id -u)"
task_gid="$(id -g)"
docker compose run --rm -T slam chown -R "$task_uid:$task_gid" /workspace/web/public/demos/icl_nuim /workspace/docs/results/icl_nuim
# H.264 is broadly playable; OpenCV's intermediate MPEG-4 videos are not.
task_expected="$(python3 -c 'import json; print(json.load(open("web/public/demos/icl_nuim/metadata.json"))["input_frames"])')"
for file in demo depth; do
  task_video="web/public/demos/icl_nuim/$file.mp4"
  task_codec="$(ffprobe -v error -select_streams v:0 -show_entries stream=codec_name -of default=nw=1:nk=1 "$task_video")"
  task_frames="$(ffprobe -v error -select_streams v:0 -show_entries stream=nb_frames -of default=nw=1:nk=1 "$task_video")"
  task_trim=()
  # Repair cached clips that included the initial sensor frame without GT.
  if [[ "$task_frames" == "$((task_expected + 1))" ]]; then
    task_trim=(-vf 'select=gte(n\,1),setpts=PTS-STARTPTS')
  elif [[ "$task_frames" != "$task_expected" ]]; then
    echo "Video frame count differs from the evaluated input: $task_video" >&2
    exit 1
  fi
  if [[ "$task_codec" == h264 && ${#task_trim[@]} == 0 ]]; then continue; fi
  ffmpeg -y -loglevel error -i "$task_video" "${task_trim[@]}" -c:v libx264 -crf 23 -pix_fmt yuv420p -movflags +faststart "$task_video.h264.mp4"
  mv "$task_video.h264.mp4" "$task_video"
  test "$(ffprobe -v error -select_streams v:0 -show_entries stream=nb_frames -of default=nw=1:nk=1 "$task_video")" = "$task_expected"
done
