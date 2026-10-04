#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
# These generated paths are owned by the container. Scope the cleanup to ICL.
docker compose run --rm -T slam python3 -c '
from pathlib import Path
import shutil
root=Path("/workspace")
shutil.rmtree(root/"data/icl_nuim",ignore_errors=True)
for sequence in (root/"outputs/icl_nuim").glob("lr_kt*"):
    for db in sequence.glob("*_run/rtabmap.db*"): db.unlink()
    shutil.rmtree(sequence/"web_textures",ignore_errors=True)
    shutil.rmtree(sequence/"source_cloud_check",ignore_errors=True)
    for condition in sequence.glob("*/mesh_error.*"): condition.unlink()
print("Removed ICL sensor data, databases and display intermediates; retained metrics, figures and master meshes.")
'
df -h .
