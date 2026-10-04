"""Loader for the Android recorder's ``offline-slam-phone-v1`` directory."""

from __future__ import annotations

import csv
import json
from pathlib import Path

import numpy as np
from scipy.spatial.transform import Rotation

from .association import associate_sorted_unique
from .schema import CameraIntrinsics, Dataset, Frame


def _number(row: dict[str, str], key: str, fallback: float | None = None) -> float:
    value = row.get(key)
    if value not in (None, ""):
        return float(value)
    if fallback is None:
        raise ValueError(f"Missing required phone dataset field: {key}")
    return fallback


def load_phone_dataset(
    root: str | Path,
    *,
    max_pose_difference_s: float = 0.01,
    confidence_min: int | None = None,
    depth_trunc_m: float | None = None,
) -> Dataset:
    root = Path(root)
    manifest = json.loads((root / "manifest.json").read_text(encoding="utf-8"))
    if manifest.get("format") not in {"offline-slam-phone-v1", "offline-slam-phone-v2"}:
        raise ValueError(f"Unsupported phone dataset format: {manifest.get('format')!r}")
    pose_records: list[tuple[float, dict[str, str]]] = []
    with (root / "poses.csv").open(newline="", encoding="utf-8") as stream:
        for row in csv.DictReader(stream):
            pose_records.append((int(row["timestamp_ns"]) / 1e9, row))
    frame_rows: list[dict[str, str]] = []
    with (root / "frames.csv").open(newline="", encoding="utf-8") as stream:
        frame_rows = list(csv.DictReader(stream))
    if not frame_rows:
        raise RuntimeError(f"No frame rows found in {root}")
    frame_records = [
        (int(row.get("pose_timestamp_ns") or row.get("timestamp_ns") or row["rgb_timestamp_ns"]) / 1e9, row)
        for row in frame_rows
    ]
    pose_matches = associate_sorted_unique(frame_records, pose_records, max_pose_difference_s)
    frames: list[Frame] = []
    for frame_id, match in enumerate(pose_matches.matches):
            row = frame_records[match.first_index][1]
            pose_row = pose_records[match.second_index][1]
            timestamp_ns = int(row.get("rgb_timestamp_ns") or row.get("timestamp_ns") or row["pose_timestamp_ns"])
            depth_width = int(_number(row, "depth_width", float(manifest["depth_width"])))
            depth_height = int(_number(row, "depth_height", float(manifest["depth_height"])))
            is_v2 = manifest["format"] == "offline-slam-phone-v2"
            intrinsics = CameraIntrinsics(
                # V2 reconstruction integrates depth-native, texture-aligned
                # color. V1 keeps its legacy RGB-sized representation only so
                # previously captured prototypes remain readable.
                width=depth_width if is_v2 else int(manifest["rgb_width"]),
                height=depth_height if is_v2 else int(manifest["rgb_height"]),
                fx=_number(row, "depth_fx", float(manifest.get("fx", 0.0))) if is_v2 else float(manifest["fx"]),
                fy=_number(row, "depth_fy", float(manifest.get("fy", 0.0))) if is_v2 else float(manifest["fy"]),
                cx=_number(row, "depth_cx", float(manifest.get("cx", 0.0))) if is_v2 else float(manifest["cx"]),
                cy=_number(row, "depth_cy", float(manifest.get("cy", 0.0))) if is_v2 else float(manifest["cy"]),
                depth_scale=1.0 / float(manifest.get("depth_scale", 0.001)),
                depth_trunc=float(manifest.get("depth_trunc", 15.0) if depth_trunc_m is None else depth_trunc_m),
                depth_width=depth_width,
                depth_height=depth_height,
                confidence_min=int(manifest.get("confidence_min", 0) if confidence_min is None else confidence_min),
            )
            transform = np.eye(4, dtype=np.float64)
            transform[:3, :3] = Rotation.from_quat([
                float(pose_row["qx"]), float(pose_row["qy"]), float(pose_row["qz"]), float(pose_row["qw"]),
            ]).as_matrix()
            transform[:3, 3] = [float(pose_row["tx"]), float(pose_row["ty"]), float(pose_row["tz"])]
            for relative_path in (row["rgb_path"], row["depth_path"], row.get("confidence_path", "")):
                if relative_path and not (root / relative_path).is_file():
                    raise FileNotFoundError(f"Phone recording references missing file: {root / relative_path}")
            mapping_keys = (
                "tex_to_image_00_x", "tex_to_image_00_y", "tex_to_image_10_x", "tex_to_image_10_y",
                "tex_to_image_11_x", "tex_to_image_11_y", "tex_to_image_01_x", "tex_to_image_01_y",
            )
            metadata = {
                "format": manifest["format"],
                "depth_registration_strategy": "texture_to_cpu_bilinear" if is_v2 else "legacy_resize",
                "rgb_width": int(_number(row, "rgb_width", float(manifest["rgb_width"]))),
                "rgb_height": int(_number(row, "rgb_height", float(manifest["rgb_height"]))),
            }
            if is_v2:
                metadata["texture_to_image_corners"] = [_number(row, key) for key in mapping_keys]
            frames.append(Frame(
                frame_id=frame_id, timestamp_ns=timestamp_ns, rgb_path=root / row["rgb_path"],
                depth_path=root / row["depth_path"], confidence_path=root / row.get("confidence_path", "") if row.get("confidence_path") else None,
                depth_timestamp_ns=int(row["depth_timestamp_ns"]), pose_timestamp_ns=int(pose_row["timestamp_ns"]),
                T_world_camera=transform, intrinsics=intrinsics, metadata=metadata,
            ))
    if not frames:
        raise RuntimeError(f"No complete frames found in {root}")
    return Dataset(
        root=root,
        intrinsics=frames[0].intrinsics,
        frames=frames,
        name=root.name,
        metadata={"association": pose_matches.stats.as_dict(), "format": manifest["format"]},
    )
