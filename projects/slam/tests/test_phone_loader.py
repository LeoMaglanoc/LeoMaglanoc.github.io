import csv
import json

import cv2
import numpy as np

from slam_pipeline.dataset.phone_dataset import load_phone_dataset


def test_phone_manifest_loader(tmp_path):
    (tmp_path / "rgb").mkdir()
    (tmp_path / "depth").mkdir()
    (tmp_path / "confidence").mkdir()
    cv2.imwrite(str(tmp_path / "rgb" / "000.jpg"), np.zeros((2, 3, 3), dtype=np.uint8))
    np.asarray([[1000, 0, 2000], [1000, 1000, 0]], dtype="<u2").tofile(tmp_path / "depth" / "000.bin")
    np.full((2, 3), 255, dtype=np.uint8).tofile(tmp_path / "confidence" / "000.bin")
    (tmp_path / "manifest.json").write_text(json.dumps({
        "format": "offline-slam-phone-v1", "rgb_width": 3, "rgb_height": 2,
        "depth_width": 3, "depth_height": 2, "fx": 2, "fy": 2, "cx": 1, "cy": 1,
        "depth_scale": 0.001,
    }))
    with (tmp_path / "poses.csv").open("w", newline="") as stream:
        writer = csv.writer(stream)
        writer.writerow(["timestamp_ns", "tx", "ty", "tz", "qx", "qy", "qz", "qw", "tracking_state"])
        writer.writerow([123, 0, 0, 0, 0, 0, 0, 1, "TRACKING"])
    with (tmp_path / "frames.csv").open("w", newline="") as stream:
        writer = csv.writer(stream)
        writer.writerow(["timestamp_ns", "rgb_path", "depth_path", "confidence_path", "depth_timestamp_ns"])
        writer.writerow([123, "rgb/000.jpg", "depth/000.bin", "confidence/000.bin", 123])

    dataset = load_phone_dataset(tmp_path)
    assert len(dataset) == 1
    assert dataset.intrinsics.depth_scale == 1000.0
    assert dataset.frames[0].T_world_camera[3, 3] == 1.0
