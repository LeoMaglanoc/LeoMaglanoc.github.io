import numpy as np

from slam_pipeline.ros.depth import raw_depth_to_meters


def tum_depth_to_meters(values: np.ndarray) -> np.ndarray:
    depth = values.astype(np.float32) / 5000.0
    depth[values == 0] = 0.0
    return depth


def test_tum_depth_scale_and_invalid_zero() -> None:
    converted = tum_depth_to_meters(np.array([5000, 10000, 0], dtype=np.uint16))
    assert np.allclose(converted, [1.0, 2.0, 0.0])


def test_tum_ros_payload_is_32fc1_meters() -> None:
    payload = raw_depth_to_meters(np.array([[0, 5000, 10000]], dtype=np.uint16), 5000.0)
    assert payload.dtype == np.float32
    assert np.allclose(payload, [[0.0, 1.0, 2.0]])
