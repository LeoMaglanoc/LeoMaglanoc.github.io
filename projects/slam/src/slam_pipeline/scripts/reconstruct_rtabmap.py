"""Open3D TSDF baseline fused at optimized poses stored in an RTAB-Map DB."""

from __future__ import annotations

import argparse
import json
from dataclasses import replace
from pathlib import Path

import yaml

from ..dataset.association import associate_sorted_unique
from ..dataset.phone_dataset import load_phone_dataset
from ..dataset.schema import CameraIntrinsics, Dataset
from ..dataset.tum_rgbd import load_tum_dataset
from ..reconstruction.tsdf import reconstruct_tsdf
from ..rtabmap.export import export_rtabmap_trajectory


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("dataset", type=Path)
    parser.add_argument("database", type=Path)
    parser.add_argument("--config", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--max-difference-s", type=float, default=0.05)
    parser.add_argument("--min-associated-frames", type=int, default=10)
    args = parser.parse_args()
    config = yaml.safe_load(args.config.read_text(encoding="utf-8"))
    association = config.get("association", {})
    if (args.dataset / "manifest.json").is_file():
        dataset = load_phone_dataset(
            args.dataset,
            max_pose_difference_s=float(association.get("max_pose_difference_s", 0.01)),
            confidence_min=int(config.get("confidence_min", 0)),
            depth_trunc_m=float(config.get("depth_trunc_m", 15.0)),
        )
    else:
        camera = config["camera"]
        intrinsics = CameraIntrinsics(
            width=int(camera["width"]), height=int(camera["height"]), fx=float(camera["fx"]), fy=float(camera["fy"]),
            cx=float(camera["cx"]), cy=float(camera["cy"]), depth_scale=float(camera.get("depth_scale", 5000.0)),
            depth_trunc=float(camera.get("depth_trunc", 4.0)),
        )
        dataset = load_tum_dataset(
            args.dataset,
            intrinsics=intrinsics,
            max_rgb_depth_difference_s=float(association.get("max_rgb_depth_difference_s", 0.02)),
            max_pose_difference_s=float(association.get("max_pose_difference_s", 0.02)),
            # The exported RTAB-Map poses below are the only poses used for
            # fusion. TUM ground truth is evaluation-only for this path.
            require_groundtruth=False,
        )
    args.output.mkdir(parents=True, exist_ok=True)
    trajectory_path = args.output / "optimized_trajectory.txt"
    estimate_timestamps, estimate_poses, _ = export_rtabmap_trajectory(
        args.database, trajectory_path, optimization="full"
    )
    dataset_records = [(frame.timestamp_ns / 1e9, frame) for frame in dataset.frames]
    estimate_records = list(zip(estimate_timestamps.tolist(), estimate_poses))
    timestamp_matches = associate_sorted_unique(dataset_records, estimate_records, args.max_difference_s)
    selected = []
    for match in timestamp_matches.matches:
        frame = dataset_records[match.first_index][1]
        pose = estimate_records[match.second_index][1]
        selected.append(replace(frame, T_world_camera=pose))
    if len(selected) < args.min_associated_frames:
        raise RuntimeError(
            f"Too few RTAB-Map poses matched RGB-D frames: {len(selected)} < {args.min_associated_frames}"
        )
    optimized = Dataset(root=dataset.root, intrinsics=dataset.intrinsics, frames=selected, name="rtabmap_optimized")
    tsdf = config["tsdf"]
    result = reconstruct_tsdf(
        optimized,
        args.output,
        voxel_length=float(tsdf.get("voxel_length", tsdf.get("voxel_length_m"))),
        sdf_trunc=float(tsdf.get("sdf_trunc", tsdf.get("sdf_trunc_m"))),
        frame_stride=int(tsdf.get("frame_stride", 1)),
        output_prefix="optimized",
    )
    result["associated_frames"] = len(selected)
    result["optimized_rtabmap_poses"] = len(estimate_poses)
    result["unmatched_rtabmap_poses"] = len(estimate_poses) - len(selected)
    result["max_timestamp_difference_s"] = timestamp_matches.stats.max_residual_s
    result["mean_timestamp_difference_s"] = timestamp_matches.stats.mean_residual_s
    result["database"] = str(args.database)
    result["trajectory_path"] = str(trajectory_path)
    (args.output / "rtabmap_tsdf_stats.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
