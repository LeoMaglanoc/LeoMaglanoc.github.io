"""Deterministic, area-weighted mesh accuracy and observed-surface completeness.

Accuracy: reconstruction samples -> exact closest GT triangle.
Completeness: fixed clean-depth visible GT points -> closest predicted triangle.
Only the supplied trajectory SE(3) aligns a prediction. No ICP or scale fitting.
"""
from pathlib import Path
import numpy as np
import open3d as o3d
from scipy.spatial.transform import Rotation


def read_obj_geometry(path: Path) -> o3d.geometry.TriangleMesh:
    """Read all OBJ polygons (including official GT quads) without texture I/O."""
    vertices, faces = [], []
    for line in path.open():
        fields = line.split()
        if not fields:
            continue
        if fields[0] == "v":
            vertices.append(list(map(float, fields[1:4])))
        elif fields[0] == "f":
            indices = [int(item.split('/')[0]) for item in fields[1:]]
            indices = [i-1 if i > 0 else len(vertices)+i for i in indices]
            faces.extend([[indices[0], indices[i], indices[i+1]] for i in range(1, len(indices)-1)])
    return validate_mesh(o3d.geometry.TriangleMesh(o3d.utility.Vector3dVector(vertices),
                                                  o3d.utility.Vector3iVector(faces)))


def validate_mesh(mesh):
    v, t = np.asarray(mesh.vertices), np.asarray(mesh.triangles)
    if not len(v) or not len(t) or not np.isfinite(v).all() or t.min() < 0 or t.max() >= len(v):
        raise ValueError("Surface metric requires a nonempty finite triangle mesh")
    return mesh


def read_mesh(path: Path):
    return read_obj_geometry(path) if path.suffix == '.obj' else validate_mesh(o3d.io.read_triangle_mesh(str(path)))


def official_gt_mesh(path: Path):
    """OBJ world has reflected X relative to official global.gt.sim world.

Normalize the reference geometry once, preserving proper GT camera rotations.
The fixed reflection is a dataset basis conversion, never a fitted alignment.
"""
    mesh = read_obj_geometry(path)
    np.asarray(mesh.vertices)[:, 0] *= -1
    np.asarray(mesh.triangles)[:, [1, 2]] = np.asarray(mesh.triangles)[:, [2, 1]]
    mesh.compute_vertex_normals()
    return mesh


def sample_surface(mesh, count=100000, seed=2026):
    validate_mesh(mesh)
    vertices = np.asarray(mesh.vertices)
    corners = vertices[np.asarray(mesh.triangles)]
    areas = np.linalg.norm(np.cross(corners[:,1]-corners[:,0], corners[:,2]-corners[:,0]),axis=1)/2
    if not np.isfinite(areas).all() or areas.sum() <= 0 or count <= 0:
        raise ValueError("Invalid surface area/sample count")
    rng = np.random.default_rng(seed)
    triangles = corners[rng.choice(len(corners), count, p=areas/areas.sum())]
    a, b = np.sqrt(rng.random(count)), rng.random(count)
    return ((1-a)[:,None]*triangles[:,0] + (a*(1-b))[:,None]*triangles[:,1] + (a*b)[:,None]*triangles[:,2])


class Surface:
    def __init__(self, mesh):
        self.scene = o3d.t.geometry.RaycastingScene(nthreads=2)
        self.scene.add_triangles(o3d.t.geometry.TriangleMesh.from_legacy(validate_mesh(mesh)))

    def distance(self, points):
        points = np.asarray(points)
        if points.ndim != 2 or points.shape[1] != 3 or not len(points) or not np.isfinite(points).all():
            raise ValueError("Expected finite nonempty Nx3 query points")
        return self.scene.compute_distance(o3d.core.Tensor(points.astype(np.float32)), nthreads=2).numpy().astype(float)

    def closest(self, points):
        return self.scene.compute_closest_points(o3d.core.Tensor(np.asarray(points,dtype=np.float32)), nthreads=2)['points'].numpy()


def transform_points(points, transform):
    return np.asarray(points) @ transform[:3,:3].T + transform[:3,3]


def validate_se3(transform):
    t = np.asarray(transform, dtype=float)
    if t.shape != (4,4) or not np.isfinite(t).all() or not np.allclose(t[3],[0,0,0,1]):
        raise ValueError("Invalid SE(3) alignment")
    if not np.allclose(t[:3,:3].T@t[:3,:3],np.eye(3),atol=1e-6) or not np.isclose(np.linalg.det(t[:3,:3]),1):
        raise ValueError("Alignment must have proper rotation and no scale")
    return t


def distribution(distances):
    return {f'{k}_m': float(v) for k,v in {
        'mean': np.mean(distances), 'median': np.median(distances), 'rmse': np.sqrt(np.mean(distances**2)),
        'std': np.std(distances), 'min': np.min(distances), 'max': np.max(distances),
        'p90': np.quantile(distances,.90), 'p95': np.quantile(distances,.95)}.items()}


def evaluate_surface(predicted, gt_mesh, visible_points, alignment=None, *, sample_count=100000, seed=2026):
    import copy
    alignment = validate_se3(np.eye(4) if alignment is None else alignment)
    mesh = copy.deepcopy(validate_mesh(predicted)).transform(alignment)
    accuracy = Surface(gt_mesh).distance(sample_surface(mesh, sample_count, seed))
    completeness = Surface(mesh).distance(visible_points)
    result = {'accuracy':distribution(accuracy),'completeness':distribution(completeness),
              'alignment_se3':alignment.tolist(),'alignment_source':'trajectory_se3_no_scale_no_icp',
              'accuracy_samples':sample_count,'visible_gt_samples':len(visible_points),'seed':seed,
              'distance_method':'point_to_triangle','sampling':'uniform_surface_area', 'f_scores':{}}
    for threshold in (.01,.02,.05):
        precision, recall = float(np.mean(accuracy <= threshold)), float(np.mean(completeness <= threshold))
        result['f_scores'][f'{threshold:.2f}'] = {'precision':precision,'recall':recall,
                          'f_score':2*precision*recall/(precision+recall) if precision+recall else 0.0}
    # Historical-style descriptive statistics, on our area-weighted samples
    # and trajectory alignment. Deliberately not labelled official SurfReg scores.
    for key in ('mean','median','std','min','max'):
        result[f'surface_accuracy_icl_{key}_m'] = result['accuracy'][f'{key}_m']
    return result, accuracy, completeness


def colorize_errors(mesh, gt_mesh, alignment=None, cap_m=.10):
    import matplotlib
    import copy
    transform = validate_se3(np.eye(4) if alignment is None else alignment)
    colored = copy.deepcopy(mesh).transform(transform)
    errors = Surface(gt_mesh).distance(np.asarray(colored.vertices))
    colored.vertex_colors = o3d.utility.Vector3dVector(matplotlib.colormaps['turbo'](np.clip(errors/cap_m,0,1))[:,:3])
    return colored


def check_pose_preservation(reference, exported, translation_tolerance_m=1e-5, rotation_tolerance_rad=1e-5):
    if len(reference) != len(exported) or not len(reference):
        raise ValueError('GT/exported pose counts differ')
    translation = max(np.linalg.norm(a[:3,3]-b[:3,3]) for a,b in zip(reference,exported))
    rotation = max(np.linalg.norm(Rotation.from_matrix(a[:3,:3].T@b[:3,:3]).as_rotvec()) for a,b in zip(reference,exported))
    if translation > translation_tolerance_m or rotation > rotation_tolerance_rad:
        raise ValueError(f'GT reconstruction poses changed: {translation} m, {rotation} rad')
    return {'max_translation_m':float(translation),'max_rotation_rad':float(rotation),
            'translation_tolerance_m':translation_tolerance_m,'rotation_tolerance_rad':rotation_tolerance_rad,'passed':True}
