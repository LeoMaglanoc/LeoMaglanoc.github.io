"""Export and evaluate an RTAB-Map trajectory against TUM ground truth."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from ..dataset.tum_rgbd import _read_groundtruth
from ..evaluation.trajectory import evaluate_trajectories
from ..rtabmap.export import export_rtabmap_trajectory


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("dataset", type=Path)
    parser.add_argument("database", type=Path)
    parser.add_argument("--config", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    groundtruth = _read_groundtruth(args.dataset / "groundtruth.txt")
    gt_timestamps = __import__("numpy").asarray([item[0] for item in groundtruth], dtype=float)
    gt_poses = [item[1] for item in groundtruth]
    raw_path = args.output / "raw_odom_trajectory.txt"
    optimized_path = args.output / "optimized_trajectory.txt"
    raw_timestamps, raw_poses, _ = export_rtabmap_trajectory(args.database, raw_path, optimization="raw")
    optimized_timestamps, optimized_poses, _ = export_rtabmap_trajectory(
        args.database, optimized_path, optimization="full"
    )
    raw_metrics = evaluate_trajectories(
        gt_timestamps, gt_poses, raw_timestamps, raw_poses, args.output, artifact_prefix="raw_odometry"
    )
    optimized_metrics = evaluate_trajectories(
        gt_timestamps, gt_poses, optimized_timestamps, optimized_poses, args.output, artifact_prefix="optimized"
    )
    import shutil

    shutil.copy2(args.output / "optimized_comparison.png", args.output / "trajectory_comparison.png")
    shutil.copy2(args.output / "optimized_ate_error.png", args.output / "ate_error.png")
    shutil.copy2(args.output / "raw_odometry_comparison.png", args.output / "trajectory_raw_vs_gt.png")
    shutil.copy2(args.output / "optimized_comparison.png", args.output / "trajectory_optimized_vs_gt.png")
    metrics = {
        "raw_odometry": {**raw_metrics, "trajectory_path": str(raw_path)},
        "optimized": {**optimized_metrics, "trajectory_path": str(optimized_path)},
    }
    (args.output / "trajectory_metrics.json").write_text(json.dumps(metrics, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(metrics, indent=2))


if __name__ == "__main__":
    main()
