from pathlib import Path

import cv2
import numpy as np

from slam_pipeline.scripts.prepare_depth_video import colorize_depth, write_depth_preview


def test_colorize_depth_preserves_invalid_pixels_and_writes_preview(tmp_path: Path):
    dataset = tmp_path / "dataset"
    dataset.mkdir()
    first = np.array([[0, 5000], [10000, 2500]], dtype=np.uint16)
    second = np.array([[5000, 0], [2500, 10000]], dtype=np.uint16)
    cv2.imwrite(str(dataset / "depth_a.png"), first)
    cv2.imwrite(str(dataset / "depth_b.png"), second)
    (dataset / "depth.txt").write_text("# timestamp filename\n0.0 depth_a.png\n0.1 depth_b.png\n", encoding="utf-8")

    color = colorize_depth(first, depth_scale=5000.0, depth_trunc_m=5.0)
    assert color.shape == (2, 2, 3)
    assert np.array_equal(color[0, 0], np.zeros(3, dtype=np.uint8))
    assert np.any(color[0, 1] != 0)

    output = tmp_path / "depth_preview.avi"
    assert write_depth_preview(dataset, output, depth_scale=5000.0, depth_trunc_m=5.0, fps=30.0) == 2
    assert output.stat().st_size > 0
