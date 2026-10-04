import numpy as np


def test_projection_round_trip() -> None:
    u, v, z = 340.0, 250.0, 2.0
    fx, fy, cx, cy = 525.0, 525.0, 319.5, 239.5
    x = (u - cx) * z / fx
    y = (v - cy) * z / fy
    assert np.isclose(x * fx / z + cx, u)
    assert np.isclose(y * fy / z + cy, v)

