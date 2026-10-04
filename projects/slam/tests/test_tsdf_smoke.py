import open3d as o3d

from slam_pipeline.reconstruction.tsdf import validate_geometry


def test_geometry_validator_accepts_nonempty_geometry() -> None:
    cloud = o3d.geometry.PointCloud(o3d.utility.Vector3dVector([[0, 0, 0], [1, 0, 0], [0, 1, 0]]))
    mesh = o3d.geometry.TriangleMesh(
        o3d.utility.Vector3dVector([[0, 0, 0], [1, 0, 0], [0, 1, 0]]),
        o3d.utility.Vector3iVector([[0, 1, 2]]),
    )
    result = validate_geometry(mesh, cloud)
    assert result["mesh_vertices"] == 3
    assert result["mesh_triangles"] == 1
    assert result["point_count"] == 3

