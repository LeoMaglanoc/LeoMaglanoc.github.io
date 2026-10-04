import cv2
import numpy as np
import pytest
from slam_pipeline.dataset.icl_nuim import CAMERA, project_native, unproject_normalized, read_global_poses, load_icl_dataset
from slam_pipeline.dataset.schema import Frame
from slam_pipeline.reconstruction.tsdf import read_color_depth


def test_negative_fy_normalization_and_depth_roundtrip():
    for point in ([.2,.3,2.],[-.1,-.2,1.5],[0,0,3.]):
        pixel = project_native(np.array(point))
        pixel[1] = CAMERA.height-1-pixel[1]
        assert np.allclose(unproject_normalized(pixel,point[2]),point)


def test_normalization_flips_both_images_once(tmp_path):
    color=np.zeros((480,640,3),dtype=np.uint8);color[0,0]=[30,50,90]
    depth=np.zeros((480,640),dtype=np.uint16);depth[0,0]=10000
    cv2.imwrite(str(tmp_path/'rgb.png'),color);cv2.imwrite(str(tmp_path/'depth.png'),depth)
    frame=Frame(0,0,tmp_path/'rgb.png',tmp_path/'depth.png',np.eye(4),CAMERA,metadata={'vertical_flip':True})
    c,d=read_color_depth(frame)
    assert list(c[-1,0]) == [30,50,90] and d[-1,0] == 10000
    assert np.array_equal(read_color_depth(frame)[1],d)


def test_global_pose_is_proper_and_inverse_roundtrip(tmp_path):
    p=tmp_path/'pose.sim';p.write_text('-0.999762 0 -0.021799 1.370500\n0 1 0 1.517390\n0.021799 0 -0.999762 1.449630\n')
    pose=read_global_poses(p)[0]
    assert np.isclose(np.linalg.det(pose[:3,:3]),1)
    assert np.allclose(np.linalg.inv(pose)@pose,np.eye(4))
    point=np.array([.1,.3,2,1]);assert np.allclose(np.linalg.inv(pose)@(pose@point),point)


def test_estimated_loader_never_opens_gt(tmp_path,monkeypatch):
    import slam_pipeline.dataset.icl_nuim as icl
    root=tmp_path/'lr_kt0';(root/'noisy/rgb').mkdir(parents=True);(root/'noisy/depth').mkdir()
    (root/'noisy/rgb/0.png').touch();(root/'noisy/depth/0.png').touch()
    (root/'noisy/associations.txt').write_text('0 depth/0.png 0 rgb/0.png\n')
    monkeypatch.setitem(icl.COUNTS,'lr_kt0',1)
    monkeypatch.setattr(icl,'read_global_poses',lambda _:pytest.fail('GT accessed'))
    data=load_icl_dataset(root,require_groundtruth=False)
    assert data.frames[0].timestamp_ns == 0
    assert np.allclose(data.frames[0].T_world_camera,np.eye(4))


def test_global_pose_indices_are_one_based(tmp_path,monkeypatch):
    import slam_pipeline.dataset.icl_nuim as icl
    root=tmp_path/'lr_kt0';(root/'clean/rgb').mkdir(parents=True);(root/'clean/depth').mkdir()
    for i in (0,1,2):
        (root/f'clean/rgb/{i}.png').touch();(root/f'clean/depth/{i}.png').touch()
    (root/'clean/associations.txt').write_text(''.join(f'{i} depth/{i}.png {i} rgb/{i}.png\n' for i in (0,1,2)))
    (root/'global.gt.sim').write_text('1 0 0 11\n0 1 0 0\n0 0 1 0\n\n1 0 0 22\n0 1 0 0\n0 0 1 0\n')
    monkeypatch.setitem(icl.COUNTS,'lr_kt0',3)
    dataset=icl.load_icl_dataset(root,condition='clean')
    assert [f.frame_id for f in dataset.frames]==[1,2]
    assert [f.T_world_camera[0,3] for f in dataset.frames]==[11,22]
    assert dataset.frames[0].timestamp_ns==round(1/30*1e9)
