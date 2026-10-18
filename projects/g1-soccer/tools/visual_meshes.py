"""Decimate display geometry only. The native/browser physics XML stays unchanged."""

import json
from pathlib import Path
import fast_simplification
import mujoco
import numpy as np
from prepare_reference import prepare

ROOT = Path(__file__).resolve().parents[1]
source = prepare()
model = mujoco.MjModel.from_xml_path(str(source / "assets/soccer_field.xml"))
meshes = {}
summary = []
for i in range(model.nmesh):
    start, count = model.mesh_vertadr[i], model.mesh_vertnum[i]
    vertices = model.mesh_vert[start : start + count].copy().astype(np.float64)
    start, count = model.mesh_faceadr[i], model.mesh_facenum[i]
    faces = model.mesh_face[start : start + count].copy()
    if count > 1500:
        vertices, faces = fast_simplification.simplify(
            vertices, faces, target_count=1500, agg=7
        )
    normals = np.zeros_like(vertices)
    triangles = vertices[faces]
    face_normals = np.cross(
        triangles[:, 1] - triangles[:, 0], triangles[:, 2] - triangles[:, 0]
    )
    for corner in range(3):
        np.add.at(normals, faces[:, corner], face_normals)
    lengths = np.linalg.norm(normals, axis=1)
    normals /= np.maximum(lengths[:, None], 1e-12)
    meshes[str(i)] = dict(
        positions=np.round(vertices.astype(np.float32), 7).reshape(-1).tolist(),
        normals=np.round(normals.astype(np.float32), 6).reshape(-1).tolist(),
        indices=faces.reshape(-1).tolist(),
    )
    summary.append(
        dict(id=i, original_triangles=int(count), display_triangles=len(faces))
    )
(ROOT / "display-meshes.json").write_text(
    json.dumps(meshes, separators=(",", ":")) + "\n"
)
(ROOT / "results/display-meshes.json").write_text(
    json.dumps(
        dict(
            tool="fast-simplification 0.1.13",
            triangle_budget_per_mesh=1500,
            meshes=summary,
        ),
        indent=2,
    )
    + "\n"
)
print(
    "Triangles:",
    sum(m["original_triangles"] for m in summary),
    "->",
    sum(m["display_triangles"] for m in summary),
)
