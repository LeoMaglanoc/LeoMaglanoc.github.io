import numpy as np
from scipy.spatial.transform import Rotation


def test_pose_inverse_round_trip() -> None:
    pose = np.eye(4)
    pose[:3, :3] = Rotation.from_euler("xyz", [10, -20, 30], degrees=True).as_matrix()
    pose[:3, 3] = [1.0, 2.0, -0.5]
    point = np.array([0.2, -0.1, 2.0, 1.0])
    assert np.allclose(np.linalg.inv(pose) @ (pose @ point), point)


def test_quaternion_rotation_round_trip() -> None:
    rotation = Rotation.from_euler("zyx", [15, 25, -5], degrees=True)
    assert np.allclose(Rotation.from_matrix(rotation.as_matrix()).as_quat(), rotation.as_quat())

