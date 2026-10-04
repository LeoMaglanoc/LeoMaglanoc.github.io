from pathlib import Path

from slam_pipeline.reconstruction.textured_mesh import inspect_textured_obj


def test_inspect_textured_obj_requires_real_uv_texture(tmp_path: Path) -> None:
    texture = tmp_path / "atlas.png"
    # A PNG signature is sufficient here: the inspector's image-load check is
    # integration-covered with RTAB-Map output, while this unit test targets OBJ.
    import cv2
    import numpy as np
    cv2.imwrite(str(texture), np.full((2, 2, 3), 255, dtype=np.uint8))
    (tmp_path / "mesh.mtl").write_text("newmtl material\nmap_Kd atlas.png\n", encoding="utf-8")
    obj = tmp_path / "mesh.obj"
    obj.write_text(
        "mtllib mesh.mtl\n"
        "v 0 0 0\nv 1 0 0\nv 0 1 0\n"
        "vt 0 0\nvt 1 0\nvt 0 1\n"
        "vn 0 0 1\nusemtl material\nf 1/1/1 2/2/1 3/3/1\n",
        encoding="utf-8",
    )
    stats = inspect_textured_obj(obj)
    assert stats["mesh_triangles"] == 1
    assert stats["uv_triangle_count"] == 1
    assert stats["texture_count"] == 1
