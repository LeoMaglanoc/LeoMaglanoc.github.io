import copy
import numpy as np
import open3d as o3d
import pytest
from scipy.spatial.transform import Rotation
from slam_pipeline.evaluation.surface import (evaluate_surface, sample_surface, Surface, check_pose_preservation,
                                               official_gt_mesh, read_obj_geometry)
from slam_pipeline.evaluation.trajectory import rigid_alignment


def plane(size=1., subdivisions=1):
    grid=np.linspace(0,size,subdivisions+1)
    v=np.array([[x,y,0] for y in grid for x in grid]);faces=[]
    for y in range(subdivisions):
        for x in range(subdivisions):
            a=y*(subdivisions+1)+x;b=a+1;c=a+subdivisions+1;d=c+1
            faces.extend([[a,b,d],[a,d,c]])
    return o3d.geometry.TriangleMesh(o3d.utility.Vector3dVector(v),o3d.utility.Vector3iVector(faces))


def score(pred,gt=None):
    gt=gt or plane();return evaluate_surface(pred,gt,sample_surface(gt,2000),sample_count=2000)[0]


def test_identical_mesh_has_zero_error():
    s=score(plane());assert s['accuracy']['mean_m'] < 1e-6;assert s['f_scores']['0.01']['f_score']==1


def test_normal_translation_one_centimetre():
    mesh=plane();mesh.translate([0,0,.01]);s=score(mesh)
    assert s['accuracy']['mean_m']==pytest.approx(.01,abs=1e-6)
    assert s['completeness']['mean_m']==pytest.approx(.01,abs=1e-6)


def test_partial_surface_good_accuracy_poor_completeness():
    s=score(plane(.5));assert s['accuracy']['mean_m']<1e-6;assert s['completeness']['mean_m']>.1
    assert s['f_scores']['0.02']['precision']==1 and s['f_scores']['0.02']['recall']<.4


def test_spurious_surface_worsens_accuracy():
    mesh=plane();extra=plane();extra.translate([0,0,.3]);mesh+=extra
    assert score(mesh)['accuracy']['mean_m']>.1


def test_triangulation_density_does_not_bias_score():
    a=plane();b=plane(subdivisions=15);a.translate([0,0,.03]);b.translate([0,0,.03])
    assert score(a)['accuracy']['mean_m']==pytest.approx(score(b)['accuracy']['mean_m'],abs=1e-6)


def test_common_rigid_motion_alignment_invariance():
    gt=plane();pred=plane();pred.translate([0,0,.03]);points=sample_surface(gt,2000)
    t=np.eye(4);t[:3,:3]=Rotation.from_euler('xyz',[.3,-.2,.7]).as_matrix();t[:3,3]=[2,3,-1]
    ref=np.array([[0,0,0],[1,0,0],[0,1,0],[0,0,1]])
    est=ref@t[:3,:3].T+t[:3,3];align=rigid_alignment(ref,est)
    base=evaluate_surface(pred,gt,points,sample_count=2000)[0]
    moved=evaluate_surface(copy.deepcopy(pred).transform(t),gt,points,align,sample_count=2000)[0]
    assert moved['accuracy']['mean_m']==pytest.approx(base['accuracy']['mean_m'],abs=1e-6)
    assert moved['completeness']['mean_m']==pytest.approx(base['completeness']['mean_m'],abs=1e-6)


def test_scale_alignment_rejected():
    with pytest.raises(ValueError):evaluate_surface(plane(),plane(),np.array([[0,0,0]]),np.diag([2,2,2,1]))


def test_pose_preservation_fails_if_optimizer_moves_gt():
    p=np.eye(4);q=p.copy();q[0,3]=.001
    assert check_pose_preservation([p],[p])['passed']
    with pytest.raises(ValueError):check_pose_preservation([p],[q])


def test_obj_quads_and_world_reflection(tmp_path):
    p=tmp_path/'gt.obj';p.write_text('v 1 0 0\nv 2 0 0\nv 2 1 0\nv 1 1 0\nf 1 2 3 4\n')
    assert len(read_obj_geometry(p).triangles)==2
    m=official_gt_mesh(p);assert np.asarray(m.vertices)[:,0].max()==-1
    assert np.asarray(m.vertex_normals)[:,2].min()>.99


def test_invalid_mesh_rejected_and_sampling_repeatable():
    with pytest.raises(ValueError):score(o3d.geometry.TriangleMesh())
    assert np.array_equal(sample_surface(plane(),100),sample_surface(plane(),100))


def test_metric_is_deterministic():
    assert score(plane()) == score(plane())
