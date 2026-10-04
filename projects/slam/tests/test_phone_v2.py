import csv
import json

import cv2
import numpy as np

from slam_pipeline.dataset.phone_dataset import load_phone_dataset
from slam_pipeline.reconstruction.tsdf import _texture_aligned_color


def test_phone_v2_uses_depth_intrinsics_and_explicit_pose_association(tmp_path):
    (tmp_path / "rgb").mkdir()
    (tmp_path / "depth").mkdir()
    (tmp_path / "confidence").mkdir()
    cv2.imwrite(str(tmp_path / "rgb" / "000.jpg"), np.zeros((4, 6, 3), dtype=np.uint8))
    np.full((2, 3), 1000, dtype="<u2").tofile(tmp_path / "depth" / "000.bin")
    np.full((2, 3), 255, dtype=np.uint8).tofile(tmp_path / "confidence" / "000.bin")
    (tmp_path / "manifest.json").write_text(json.dumps({
        "format": "offline-slam-phone-v2", "rgb_width": 6, "rgb_height": 4,
        "depth_width": 3, "depth_height": 2, "depth_scale": 0.001,
    }))
    with (tmp_path / "poses.csv").open("w", newline="") as stream:
        writer = csv.writer(stream)
        writer.writerow(["timestamp_ns", "tx", "ty", "tz", "qx", "qy", "qz", "qw", "tracking_state"])
        writer.writerow([1_000_005, 0, 0, 0, 0, 0, 0, 1, "TRACKING"])
    header = [
        "frame_id", "rgb_timestamp_ns", "depth_timestamp_ns", "pose_timestamp_ns", "rgb_path", "depth_path",
        "confidence_path", "rgb_fx", "rgb_fy", "rgb_cx", "rgb_cy", "depth_fx", "depth_fy", "depth_cx",
        "depth_cy", "rgb_width", "rgb_height", "depth_width", "depth_height", "is_new_depth", "tracking_state",
        "tex_to_image_00_x", "tex_to_image_00_y", "tex_to_image_10_x", "tex_to_image_10_y",
        "tex_to_image_11_x", "tex_to_image_11_y", "tex_to_image_01_x", "tex_to_image_01_y",
    ]
    with (tmp_path / "frames.csv").open("w", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=header)
        writer.writeheader()
        writer.writerow(dict(zip(header, [
            0, 1_000_000, 999_000, 1_000_000, "rgb/000.jpg", "depth/000.bin", "confidence/000.bin",
            10, 10, 3, 2, 5, 5, 1, 0.5, 6, 4, 3, 2, "true", "TRACKING", 0, 0, 5, 0, 5, 3, 0, 3,
        ])))
    dataset = load_phone_dataset(tmp_path, max_pose_difference_s=1e-5, confidence_min=128, depth_trunc_m=6.0)
    frame = dataset.frames[0]
    assert frame.intrinsics.width == 3
    assert frame.intrinsics.height == 2
    assert frame.intrinsics.fx == 5
    assert frame.intrinsics.depth_trunc == 6.0
    assert frame.pose_timestamp_ns == 1_000_005


def test_texture_mapping_reprojects_cpu_color_at_depth_resolution(tmp_path):
    from slam_pipeline.dataset.schema import CameraIntrinsics, Frame

    color = np.zeros((4, 6, 3), dtype=np.uint8)
    color[:, :, 1] = np.arange(6, dtype=np.uint8)
    frame = Frame(
        frame_id=0, timestamp_ns=0, rgb_path=tmp_path / "rgb.jpg", depth_path=tmp_path / "depth.bin",
        T_world_camera=np.eye(4), intrinsics=CameraIntrinsics(3, 2, 5, 5, 1, 0.5),
        metadata={"texture_to_image_corners": [0, 0, 5, 0, 5, 3, 0, 3]},
    )
    registered = _texture_aligned_color(frame, color, (2, 3))
    assert registered.shape[:2] == (2, 3)
    assert int(registered[0, 0, 1]) < int(registered[0, -1, 1])
