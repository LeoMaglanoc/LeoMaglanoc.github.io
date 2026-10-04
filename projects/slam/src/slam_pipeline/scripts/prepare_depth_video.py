"""Render TUM depth PNGs as a colorized MJPEG preview video.

The intermediate AVI is deliberately created inside the reproducible SLAM
container. The host-side presentation script subsequently transcodes it to
the browser-compatible H.264 MP4 alongside the official RGB AVI.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import cv2
import numpy as np


def depth_records(dataset: Path) -> list[Path]:
    index = dataset / "depth.txt"
    records: list[Path] = []
    for line in index.read_text(encoding="utf-8").splitlines():
        fields = line.split()
        if not fields or fields[0].startswith("#"):
            continue
        if len(fields) != 2:
            raise ValueError(f"Invalid depth index row: {line}")
        records.append(dataset / fields[1])
    if not records:
        raise ValueError(f"No depth frames listed in {index}")
    return records


def colorize_depth(depth_raw: np.ndarray, depth_scale: float, depth_trunc_m: float) -> np.ndarray:
    """Return a BGR Turbo visualization, preserving invalid depth as black."""
    if depth_raw.ndim != 2:
        raise ValueError("Depth frame must be a single-channel image")
    if depth_scale <= 0 or depth_trunc_m <= 0:
        raise ValueError("Depth scale and truncation must be positive")
    depth_m = depth_raw.astype(np.float32) / np.float32(depth_scale)
    valid = (depth_m > 0.0) & np.isfinite(depth_m)
    normalized = np.clip(depth_m / np.float32(depth_trunc_m), 0.0, 1.0)
    grayscale = np.round(normalized * 255.0).astype(np.uint8)
    color = cv2.applyColorMap(grayscale, cv2.COLORMAP_TURBO)
    color[~valid] = 0
    return color


def write_depth_preview(dataset: Path, output: Path, depth_scale: float, depth_trunc_m: float, fps: float) -> int:
    records = depth_records(dataset)
    first = cv2.imread(str(records[0]), cv2.IMREAD_UNCHANGED)
    if first is None:
        raise FileNotFoundError(records[0])
    height, width = first.shape[:2]
    output.parent.mkdir(parents=True, exist_ok=True)
    writer = cv2.VideoWriter(str(output), cv2.VideoWriter_fourcc(*"MJPG"), fps, (width, height))
    if not writer.isOpened():
        raise RuntimeError(f"Could not open depth preview video for writing: {output}")
    try:
        for path in records:
            depth = cv2.imread(str(path), cv2.IMREAD_UNCHANGED)
            if depth is None:
                raise FileNotFoundError(path)
            if depth.shape[:2] != (height, width):
                raise ValueError(f"Depth frame has inconsistent shape: {path}")
            writer.write(colorize_depth(depth, depth_scale, depth_trunc_m))
    finally:
        writer.release()
    if not output.is_file() or output.stat().st_size == 0:
        raise RuntimeError(f"Depth preview was not written: {output}")
    return len(records)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("dataset", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--depth-scale", type=float, default=5000.0)
    parser.add_argument("--depth-trunc-m", type=float, default=5.0)
    parser.add_argument("--fps", type=float, default=30.0)
    args = parser.parse_args()
    count = write_depth_preview(args.dataset, args.output, args.depth_scale, args.depth_trunc_m, args.fps)
    print(f"Prepared {count} colorized depth frames at {args.output}")


if __name__ == "__main__":
    main()
