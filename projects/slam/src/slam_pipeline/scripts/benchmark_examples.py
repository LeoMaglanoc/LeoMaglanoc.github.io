"""Create inspectable RGB and depth examples from a normalized dataset."""

from __future__ import annotations

import argparse
from pathlib import Path

import cv2
import numpy as np
import yaml

from ..dataset.schema import CameraIntrinsics
from ..dataset.tum_rgbd import load_tum_dataset


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("dataset", type=Path)
    parser.add_argument("--config", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    config = yaml.safe_load(args.config.read_text(encoding="utf-8"))
    camera = config["camera"]
    intrinsics = CameraIntrinsics(
        width=int(camera["width"]), height=int(camera["height"]),
        fx=float(camera["fx"]), fy=float(camera["fy"]),
        cx=float(camera["cx"]), cy=float(camera["cy"]),
        depth_scale=float(camera.get("depth_scale", 5000.0)),
        depth_trunc=float(camera.get("depth_trunc", 4.0)),
    )
    association = config.get("association", {})
    dataset = load_tum_dataset(
        args.dataset,
        intrinsics=intrinsics,
        max_rgb_depth_difference_s=float(association.get("max_rgb_depth_difference_s", 0.02)),
        max_pose_difference_s=float(association.get("max_pose_difference_s", 0.02)),
        require_groundtruth=False,
    )
    frame = dataset.frames[len(dataset.frames) // 2]
    color = cv2.imread(str(frame.rgb_path), cv2.IMREAD_COLOR)
    depth = cv2.imread(str(frame.depth_path), cv2.IMREAD_UNCHANGED)
    if color is None or depth is None:
        raise IOError(f"Could not read benchmark example frame {frame.frame_id}")
    args.output.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(args.output / "rgb_example.png"), color)
    depth_m = depth.astype(np.float32) / frame.intrinsics.depth_scale
    valid = depth_m > 0
    if not np.any(valid):
        raise RuntimeError("Benchmark example has no valid depth")
    clipped = np.clip(depth_m, 0.0, frame.intrinsics.depth_trunc)
    visualization = np.zeros(depth.shape, dtype=np.uint8)
    visualization[valid] = np.round(255.0 * clipped[valid] / frame.intrinsics.depth_trunc).astype(np.uint8)
    visualization = cv2.applyColorMap(visualization, cv2.COLORMAP_TURBO)
    cv2.imwrite(str(args.output / "depth_example.png"), visualization)


if __name__ == "__main__":
    main()
