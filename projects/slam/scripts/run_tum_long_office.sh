#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."
# Dataset/video retrieval uses the host's pre-existing curl/ffmpeg because this
# Docker network is intentionally isolated. Robotics computation remains in
# the reproducible `slam` container below.
./scripts/download_tum.sh freiburg3_long_office_household
./scripts/prepare_demo_video.sh freiburg3_long_office_household
docker compose run --rm slam bash /workspace/scripts/run_tum_long_office_container.sh
docker compose run --rm web npx obj2gltf -i /workspace/outputs/tum_long_office/rtabmap_textured/web/mesh.obj -o /workspace/outputs/tum_long_office/rtabmap_textured/web/scene.glb -b
docker compose run --rm slam bash -lc '
  python3 -m slam_pipeline.scripts.export_web_demo data/rgbd_dataset_freiburg3_long_office_household --config config/tum_freiburg3_long_office_household.yaml --output outputs/tum_long_office --public-dir web/public/demos/freiburg3_long_office_household
  python3 -m slam_pipeline.scripts.benchmark_report --sequence freiburg3_long_office_household --dataset data/rgbd_dataset_freiburg3_long_office_household --output outputs/tum_long_office --docs-output docs/results/tum_long_office
  python3 -m slam_pipeline.scripts.validate_benchmark outputs/tum_long_office --require-web-demo
'
