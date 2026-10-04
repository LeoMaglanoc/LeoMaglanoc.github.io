import numpy as np
from scipy.spatial.transform import Rotation

from slam_pipeline.scripts.export_web_demo import convert_pose_to_threejs


def test_threejs_pose_conversion_preserves_metric_translation_and_rotation() -> None:
    pose = np.eye(4)
    pose[:3, :3] = Rotation.from_euler("xyz", [10, -20, 30], degrees=True).as_matrix()
    pose[:3, 3] = [1.5, -2.0, 0.25]
    converted = convert_pose_to_threejs(pose)
    assert np.allclose(converted[:3, 3], [1.5, 2.0, -0.25])
    assert np.isclose(np.linalg.det(converted[:3, :3]), 1.0)
    assert np.allclose(convert_pose_to_threejs(converted), pose)
