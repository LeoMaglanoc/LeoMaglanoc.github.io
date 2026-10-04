"""Dataset-neutral sensor records and pose conventions.

All poses use ``T_world_camera``. A point in camera coordinates is transformed
to world coordinates with ``p_world = T_world_camera @ p_camera``.
"""

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterator, Optional

import numpy as np


@dataclass(frozen=True)
class CameraIntrinsics:
    width: int
    height: int
    fx: float
    fy: float
    cx: float
    cy: float
    depth_scale: float = 5000.0
    depth_trunc: float = 4.0
    depth_width: int | None = None
    depth_height: int | None = None
    confidence_min: int = 0

    def matrix(self) -> np.ndarray:
        return np.array(
            [[self.fx, 0.0, self.cx], [0.0, self.fy, self.cy], [0.0, 0.0, 1.0]],
            dtype=np.float64,
        )


@dataclass
class Frame:
    frame_id: int
    timestamp_ns: int
    rgb_path: Path
    depth_path: Path
    T_world_camera: np.ndarray
    intrinsics: CameraIntrinsics
    depth_timestamp_ns: Optional[int] = None
    pose_timestamp_ns: Optional[int] = None
    confidence_path: Optional[Path] = None
    imu_timestamp_ns: Optional[int] = None
    metadata: dict[str, Any] = field(default_factory=dict)

    def __post_init__(self) -> None:
        pose = np.asarray(self.T_world_camera, dtype=np.float64)
        if pose.shape != (4, 4):
            raise ValueError(f"T_world_camera must have shape (4, 4), got {pose.shape}")
        self.T_world_camera = pose


@dataclass
class Dataset:
    root: Path
    intrinsics: CameraIntrinsics
    frames: list[Frame] = field(default_factory=list)
    name: str = "dataset"
    metadata: dict[str, Any] = field(default_factory=dict)

    def __len__(self) -> int:
        return len(self.frames)

    def __iter__(self) -> Iterator[Frame]:
        return iter(self.frames)
