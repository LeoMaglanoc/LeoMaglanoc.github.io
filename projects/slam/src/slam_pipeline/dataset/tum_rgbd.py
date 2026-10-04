"""Loader and timestamp association for the TUM RGB-D benchmark."""

from pathlib import Path
import numpy as np
from scipy.spatial.transform import Rotation

from .association import associate_sorted_unique
from .schema import CameraIntrinsics, Dataset, Frame


def _read_index(path: Path) -> list[tuple[float, str]]:
    records: list[tuple[float, str]] = []
    with path.open("r", encoding="utf-8") as stream:
        for line in stream:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            parts = line.split()
            if len(parts) < 2:
                continue
            records.append((float(parts[0]), parts[1]))
    return records


def _read_groundtruth(path: Path) -> list[tuple[float, np.ndarray]]:
    records: list[tuple[float, np.ndarray]] = []
    with path.open("r", encoding="utf-8") as stream:
        for line in stream:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            parts = line.split()
            if len(parts) != 8:
                continue
            timestamp, tx, ty, tz, qx, qy, qz, qw = map(float, parts)
            transform = np.eye(4, dtype=np.float64)
            transform[:3, :3] = Rotation.from_quat([qx, qy, qz, qw]).as_matrix()
            transform[:3, 3] = [tx, ty, tz]
            records.append((timestamp, transform))
    return records


def load_tum_dataset(
    root: str | Path,
    *,
    intrinsics: CameraIntrinsics | None = None,
    max_rgb_depth_difference_s: float = 0.02,
    max_pose_difference_s: float = 0.02,
    require_groundtruth: bool = True,
) -> Dataset:
    root = Path(root)
    if intrinsics is None:
        intrinsics = CameraIntrinsics(640, 480, 525.0, 525.0, 319.5, 239.5)
    required = [root / "rgb.txt", root / "depth.txt"]
    if require_groundtruth:
        required.append(root / "groundtruth.txt")
    missing = [str(path) for path in required if not path.exists()]
    if missing:
        raise FileNotFoundError("Missing TUM files: " + ", ".join(missing))

    rgb = _read_index(root / "rgb.txt")
    depth = _read_index(root / "depth.txt")
    groundtruth = _read_groundtruth(root / "groundtruth.txt") if require_groundtruth else []
    rgb_depth = associate_sorted_unique(rgb, depth, max_rgb_depth_difference_s)
    rgb_depth_records = rgb_depth.pairs(rgb, depth)
    rgb_depth_by_timestamp = [(rgb_record[0], (rgb_record, depth_record)) for rgb_record, depth_record in rgb_depth_records]
    rgb_depth_pose = associate_sorted_unique(rgb_depth_by_timestamp, groundtruth, max_pose_difference_s) if require_groundtruth else None
    frames: list[Frame] = []
    selected = rgb_depth_pose.matches if rgb_depth_pose is not None else [None] * len(rgb_depth_by_timestamp)
    for frame_id, match in enumerate(selected):
        record_index = match.first_index if match is not None else frame_id
        rgb_record, depth_record = rgb_depth_by_timestamp[record_index][1]
        rgb_timestamp, rgb_relative = rgb_record
        depth_timestamp, depth_relative = depth_record
        pose_timestamp, pose = groundtruth[match.second_index] if match is not None else (rgb_timestamp, np.eye(4, dtype=np.float64))
        frames.append(
            Frame(
                frame_id=frame_id,
                timestamp_ns=round(rgb_timestamp * 1e9),
                rgb_path=root / rgb_relative,
                depth_path=root / depth_relative,
                depth_timestamp_ns=round(depth_timestamp * 1e9),
                pose_timestamp_ns=round(pose_timestamp * 1e9),
                T_world_camera=pose,
                intrinsics=intrinsics,
            )
        )
    if not frames:
        raise RuntimeError(f"No associated RGB/depth{'/ground-truth' if require_groundtruth else ''} frames found in {root}")
    return Dataset(
        root=root,
        intrinsics=intrinsics,
        frames=frames,
        name=root.name,
        metadata={
            "association": {
                "rgb_observations": len(rgb),
                "depth_observations": len(depth),
                "pose_observations": len(groundtruth),
                "associated_rgb_depth_pairs": len(rgb_depth.matches),
                "associated_rgb_depth_pose_triples": len(rgb_depth_pose.matches) if rgb_depth_pose else 0,
                "dropped_rgb_frames": len(rgb) - len(frames),
                "rgb_depth": rgb_depth.stats.as_dict(),
                "rgb_depth_pose": rgb_depth_pose.stats.as_dict() if rgb_depth_pose else None,
            }
        },
    )
