"""Depth conversion at the ROS boundary."""

from __future__ import annotations

import numpy as np


def raw_depth_to_meters(depth_raw: np.ndarray, depth_scale: float) -> np.ndarray:
    """Convert integer sensor units to ROS ``32FC1`` metres.

    ``depth_scale`` is raw units per metre: 5000 for TUM PNG depth and 1000
    for ARCore raw-depth millimetres. Zero remains the invalid-depth sentinel.
    """
    if depth_scale <= 0:
        raise ValueError("depth_scale must be positive")
    depth = np.asarray(depth_raw)
    if depth.ndim != 2:
        raise ValueError(f"Depth image must be 2-D, got shape {depth.shape}")
    meters = depth.astype(np.float32) / np.float32(depth_scale)
    meters[depth == 0] = 0.0
    return meters
