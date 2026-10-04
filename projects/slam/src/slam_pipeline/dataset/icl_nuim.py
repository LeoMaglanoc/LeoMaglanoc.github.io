"""ICL TUM-PNG adapter, normalized once at the sensor boundary.

Official associations use zero-based frame IDs, not seconds; global .gt.sim
contains one-based camera-to-POVRay-world 3x4 poses (row block 0 is
frame ID 1). PNG frame 0 has no corresponding published GT pose. Native fy=-480 is normalized
by flipping BOTH images vertically (v'=height-1-v); the camera basis and poses
remain unchanged. This avoids introducing a reflection into an SE(3) pose.
The resulting images use x right, y down, z forward and positive intrinsics.
PNG values are camera-Z depth at 5000 units/metre, not native radial .depth.
"""
from pathlib import Path
import numpy as np
from .schema import CameraIntrinsics, Dataset, Frame

COUNTS = {"lr_kt0": 1510, "lr_kt1": 967, "lr_kt2": 882, "lr_kt3": 1242}
CAMERA = CameraIntrinsics(640, 480, 481.2, 480.0, 319.5, 239.5, 5000.0, 6.0)


def read_global_poses(path: Path) -> list[np.ndarray]:
    values = np.loadtxt(path)
    if values.ndim != 2 or values.shape[1] != 4 or len(values) % 3:
        raise ValueError(f"Invalid ICL 3x4 pose stream: {path}")
    poses = []
    for block in values.reshape(-1, 3, 4):
        pose = np.eye(4)
        u, _, vt = np.linalg.svd(block[:, :3])
        pose[:3, :3] = u @ vt  # official poses rounded to six decimal places
        pose[:3, 3] = block[:, 3]
        if np.linalg.det(pose[:3, :3]) < 0 or not np.isfinite(pose).all():
            raise ValueError("ICL pose must be a finite proper rigid transform")
        poses.append(pose)
    return poses


def project_native(point: np.ndarray) -> np.ndarray:
    x, y, z = point
    if z <= 0:
        raise ValueError("Point must be in front of camera")
    return np.array([481.2*x/z+319.5, -480.0*y/z+239.5])


def unproject_normalized(pixel: np.ndarray, depth_m: float) -> np.ndarray:
    u, v = pixel
    return np.array([(u-CAMERA.cx)/CAMERA.fx*depth_m,
                     (v-CAMERA.cy)/CAMERA.fy*depth_m, depth_m])


def load_icl_dataset(root: str | Path, *, condition: str = "noisy", require_groundtruth: bool = True) -> Dataset:
    root = Path(root)
    if condition not in {"clean", "noisy"} or root.name not in COUNTS:
        raise ValueError("Expected lr_kt0–lr_kt3 and clean/noisy")
    sensor = root / condition
    poses = read_global_poses(root / "global.gt.sim") if require_groundtruth else None
    frames = []
    for line in (sensor / "associations.txt").read_text().splitlines():
        if not line.strip() or line.startswith("#"):
            continue
        depth_id, depth_path, rgb_id, rgb_path = line.split()
        index = int(rgb_id)
        if index != int(depth_id):
            raise ValueError("ICL RGB and depth IDs must match")
        for name in (rgb_path, depth_path):
            if not (sensor/name).is_file():
                raise FileNotFoundError(sensor/name)
        if poses is not None and not 1 <= index <= len(poses):
            continue
        frames.append(Frame(index, round(index/30*1e9), sensor/rgb_path, sensor/depth_path,
                            poses[index-1] if poses is not None else np.eye(4), CAMERA,
                            metadata={"vertical_flip": True, "dataset": "icl_nuim"}))
    if not (COUNTS[root.name]-2 <= len(frames) <= COUNTS[root.name]) or [f.frame_id for f in frames] != list(range(1 if poses is not None else 0, len(frames)+(1 if poses is not None else 0))):
        raise ValueError(f"Incomplete/nonsequential ICL stream: {len(frames)} frames")
    if poses is not None and len(poses) != len(frames):
        raise ValueError("ICL pose count does not match frame count")
    return Dataset(root, CAMERA, frames, root.name, {"family": "icl_nuim", "condition": condition,
                   "pose_source": "official_global_gt" if poses is not None else "none",
                   "normalization": "vertical_flip_rgb_and_depth", "frame_rate_hz": 30, "official_advertised_frames": COUNTS[root.name],
                   "loaded_frames": len(frames), "unposed_initial_sensor_frames": sum(1 for line in (sensor/"associations.txt").read_text().splitlines() if line.strip() and not line.startswith("#"))-len(frames)})
