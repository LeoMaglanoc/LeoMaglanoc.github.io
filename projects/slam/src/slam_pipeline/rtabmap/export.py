"""Official RTAB-Map trajectory export helpers.

Optimized poses must be produced by ``rtabmap-export`` rather than decoded
from the database's internal ``Node.pose`` representation.
"""

from __future__ import annotations

import os
import shutil
import subprocess
from pathlib import Path

import numpy as np
from scipy.spatial.transform import Rotation


_OPTIMIZATION = {"full": "0", "raw": "3"}


def resolve_rtabmap_executable(executable: str = "rtabmap-export") -> tuple[str, Path | None]:
    """Resolve a CLI from PATH or the active ROS installation consistently."""
    resolved = shutil.which(executable)
    ros_prefix: Path | None = None
    if resolved is None:
        candidate_prefix = Path("/opt/ros") / os.environ.get("ROS_DISTRO", "jazzy")
        candidate = candidate_prefix / "bin" / executable
        if candidate.is_file():
            resolved, ros_prefix = str(candidate), candidate_prefix
    if resolved is None:
        raise FileNotFoundError(f"Could not find RTAB-Map executable: {executable}")
    return resolved, ros_prefix


def parse_pose_format_11(path: str | Path) -> tuple[np.ndarray, list[np.ndarray], list[int]]:
    """Parse RTAB-Map format 11: stamp, pose quaternion, and node ID."""
    timestamps: list[float] = []
    poses: list[np.ndarray] = []
    node_ids: list[int] = []
    with Path(path).open("r", encoding="utf-8") as stream:
        for line_number, line in enumerate(stream, start=1):
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            values = line.split()
            if len(values) != 9:
                raise ValueError(f"Expected 9 columns in RTAB-Map pose format 11 at {path}:{line_number}")
            timestamp, tx, ty, tz, qx, qy, qz, qw = map(float, values[:8])
            pose = np.eye(4, dtype=np.float64)
            pose[:3, :3] = Rotation.from_quat([qx, qy, qz, qw]).as_matrix()
            pose[:3, 3] = [tx, ty, tz]
            timestamps.append(timestamp)
            poses.append(pose)
            node_ids.append(int(values[8]))
    if not poses:
        raise ValueError(f"No RTAB-Map poses found in {path}")
    return np.asarray(timestamps, dtype=np.float64), poses, node_ids


def export_rtabmap_trajectory(
    database: str | Path,
    output: str | Path,
    *,
    optimization: str = "full",
    executable: str = "rtabmap-export",
) -> tuple[np.ndarray, list[np.ndarray], list[int]]:
    """Export and parse a trajectory using the supported RTAB-Map CLI.

    ``optimization='full'`` invokes full global graph optimization (``--opt
    0``); ``'raw'`` exports unoptimized external odometry (``--opt 3``).
    """
    if optimization not in _OPTIMIZATION:
        raise ValueError(f"Unsupported optimization mode {optimization!r}; expected one of {sorted(_OPTIMIZATION)}")
    database = Path(database)
    output = Path(output)
    if not database.is_file() or database.stat().st_size == 0:
        raise FileNotFoundError(f"RTAB-Map database missing or empty: {database}")
    output.parent.mkdir(parents=True, exist_ok=True)
    resolved_executable, ros_prefix = resolve_rtabmap_executable(executable)
    prefix = f"{output.stem}_export"
    generated = output.parent / f"{prefix}_poses.txt"
    command = [
        resolved_executable,
        "--poses",
        "--poses_format",
        "11",
        "--opt",
        _OPTIMIZATION[optimization],
        "--output",
        prefix,
        "--output_dir",
        str(output.parent),
        str(database),
    ]
    environment = os.environ.copy()
    if ros_prefix is not None:
        existing_library_path = environment.get("LD_LIBRARY_PATH", "")
        library_paths = [ros_prefix / "lib", *sorted((ros_prefix / "lib").glob("*/"))]
        environment["LD_LIBRARY_PATH"] = ":".join(
            [*(str(path) for path in library_paths), existing_library_path]
        ).rstrip(":")
    subprocess.run(command, check=True, text=True, env=environment)
    if not generated.is_file():
        raise RuntimeError(f"rtabmap-export did not create expected pose file: {generated}")
    timestamps, poses, node_ids = parse_pose_format_11(generated)
    # Preserve RTAB-Map's official format-11 source (including node IDs) for
    # auditability, and write a standard 8-column TUM trajectory for Open3D,
    # evo, and the project evaluator.
    format11_path = output.with_name(f"{output.stem}_format11.txt")
    generated.replace(format11_path)
    with output.open("w", encoding="utf-8") as stream:
        for timestamp, pose in zip(timestamps, poses):
            qx, qy, qz, qw = Rotation.from_matrix(pose[:3, :3]).as_quat()
            tx, ty, tz = pose[:3, 3]
            stream.write(
                f"{timestamp:.9f} {tx:.9f} {ty:.9f} {tz:.9f} "
                f"{qx:.9f} {qy:.9f} {qz:.9f} {qw:.9f}\n"
            )
    return timestamps, poses, node_ids
