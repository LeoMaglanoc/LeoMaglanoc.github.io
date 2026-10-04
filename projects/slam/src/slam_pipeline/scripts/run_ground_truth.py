"""Run the first benchmark gate: TUM ground truth directly into Open3D TSDF."""

import argparse
import json
from pathlib import Path

import yaml

from ..dataset.schema import CameraIntrinsics
from ..dataset.tum_rgbd import load_tum_dataset
from ..reconstruction.tsdf import reconstruct_tsdf


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("dataset", type=Path)
    parser.add_argument("--config", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    config = yaml.safe_load(args.config.read_text(encoding="utf-8"))
    camera = config["camera"]
    intrinsics = CameraIntrinsics(
        width=int(camera["width"]),
        height=int(camera["height"]),
        fx=float(camera["fx"]),
        fy=float(camera["fy"]),
        cx=float(camera["cx"]),
        cy=float(camera["cy"]),
        depth_scale=float(camera.get("depth_scale", 5000.0)),
        depth_trunc=float(camera.get("depth_trunc", 4.0)),
    )
    association = config.get("association", {})
    dataset = load_tum_dataset(
        args.dataset,
        intrinsics=intrinsics,
        max_rgb_depth_difference_s=float(association.get("max_rgb_depth_difference_s", 0.02)),
        max_pose_difference_s=float(association.get("max_pose_difference_s", 0.02)),
    )
    tsdf = config["tsdf"]
    result = reconstruct_tsdf(
        dataset,
        args.output,
        voxel_length=float(tsdf["voxel_length"]),
        sdf_trunc=float(tsdf["sdf_trunc"]),
        frame_stride=int(tsdf.get("frame_stride", 1)),
    )
    result["dataset"] = str(args.dataset)
    result["associated_frames"] = len(dataset)
    result["association"] = dataset.metadata.get("association", {})
    args.output.mkdir(parents=True, exist_ok=True)
    (args.output / "gt_stats.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
