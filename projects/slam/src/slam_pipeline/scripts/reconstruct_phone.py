"""Reconstruct an Android phone recording directly from ARCore poses."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import yaml

from ..dataset.phone_dataset import load_phone_dataset
from ..reconstruction.tsdf import reconstruct_tsdf


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("recording", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--config", type=Path, default=Path("config/phone_default.yaml"))
    args = parser.parse_args()
    config = yaml.safe_load(args.config.read_text(encoding="utf-8"))
    association = config.get("association", {})
    dataset = load_phone_dataset(
        args.recording,
        max_pose_difference_s=float(association.get("max_pose_difference_s", 0.01)),
        confidence_min=int(config.get("confidence_min", 0)),
        depth_trunc_m=float(config.get("depth_trunc_m", 15.0)),
    )
    registration_strategy = str(config.get("depth_registration_strategy", "texture_to_cpu_bilinear"))
    frame_strategies = {str(frame.metadata.get("depth_registration_strategy")) for frame in dataset.frames}
    if registration_strategy not in frame_strategies:
        raise ValueError(
            f"Recording registration strategy {frame_strategies} does not match requested {registration_strategy!r}"
        )
    tsdf = config["tsdf"]
    result = reconstruct_tsdf(
        dataset,
        args.output,
        voxel_length=float(tsdf["voxel_length_m"]),
        sdf_trunc=float(tsdf["sdf_trunc_m"]),
        frame_stride=int(tsdf.get("frame_stride", 1)),
        output_prefix="phone",
    )
    result["recording"] = str(args.recording)
    result["config"] = str(args.config)
    result["effective_config"] = config
    result["association"] = dataset.metadata.get("association", {})
    args.output.mkdir(parents=True, exist_ok=True)
    (args.output / "phone_tsdf_stats.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
