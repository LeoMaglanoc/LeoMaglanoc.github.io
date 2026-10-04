"""Independently check native GT cloud coordinates before blaming meshing."""
import argparse
import json
from pathlib import Path
import cv2
import numpy as np
import open3d as o3d
import yaml
from ..dataset.icl_nuim import load_icl_dataset
from ..evaluation.surface import Surface, distribution, read_mesh


def check_native_cloud(output,dataset,ids,gt,config):
    from .icl_benchmark import command, write_json
    folder=output/'source_cloud_check';folder.mkdir(exist_ok=True)
    settings=config['rtabmap'];stride=int(settings['decimation']);voxel=float(settings['voxel'])
    args=['rtabmap-export','--cloud','--opt','3','--output','source','--output_dir',folder,
          '--decimation',stride,'--voxel',voxel,'--min_range',settings['min_range'],
          '--max_range',settings['max_range'],output/'gt_run/rtabmap.db']
    command(args,folder/'export.log')
    path=folder/'source_cloud.ply'
    native=o3d.io.read_point_cloud(str(path))
    chunks=[];wanted=set(ids)
    for frame in dataset.frames:
        if frame.frame_id not in wanted:continue
        depth=np.flipud(cv2.imread(str(frame.depth_path),-1))[::stride,::stride]/frame.intrinsics.depth_scale
        v,u=np.mgrid[0:frame.intrinsics.height:stride,0:frame.intrinsics.width:stride]
        valid=(depth>float(settings['min_range']))&(depth<float(settings['max_range']))
        camera=frame.intrinsics
        points=np.stack([(u-camera.cx)*depth/camera.fx,(v-camera.cy)*depth/camera.fy,depth],axis=-1)[valid]
        chunks.append(points@frame.T_world_camera[:3,:3].T+frame.T_world_camera[:3,3])
    expected=o3d.geometry.PointCloud(o3d.utility.Vector3dVector(np.concatenate(chunks)))
    chunks.clear();expected=expected.voxel_down_sample(voxel)
    count=100000;rng=np.random.default_rng(2026)
    points=np.asarray(native.points)
    samples=points[rng.choice(len(points),min(count,len(points)),replace=False)]
    sampled=o3d.geometry.PointCloud(o3d.utility.Vector3dVector(samples))
    difference=distribution(np.asarray(sampled.compute_point_cloud_distance(expected)))
    surface=Surface(gt)
    reference=np.asarray(expected.points)
    reference=reference[rng.choice(len(reference),min(count,len(reference)),replace=False)]
    result={'sequence':dataset.name,'source':'native_GT_pose_depth_cloud','source_frame_ids':ids,
            'settings':settings,'command':list(map(str,args)),'seed':2026,'sample_count':len(samples),
            'sampling':'uniform_voxel_cloud_points_not_surface_area','native_points':len(points),'independent_points':len(expected.points),
            'native_to_independently_unprojected_cloud':difference,'p95_tolerance_m':2*voxel,
            'native_cloud_to_GT':distribution(surface.distance(samples)),
            'independent_cloud_to_GT':distribution(surface.distance(reference)),
            'passed':difference['p95_m']<=2*voxel}
    write_json(output/'native_source_cloud_validation.json',result)
    path.unlink()
    if not result['passed']:raise RuntimeError('Native GT depth cloud disagrees with independent unprojection')
    print('Native cloud coordinates passed independent unprojection check',flush=True)
    return result


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--output',type=Path,default=Path('outputs/icl_nuim/lr_kt0'))
    args=p.parse_args();root=args.output
    config=yaml.safe_load((Path('config')/f'icl_{root.name}.yaml').read_text())
    data=load_icl_dataset(Path('data/icl_nuim')/root.name)
    check_native_cloud(root,data,json.loads((root/'frame_ids.json').read_text()),read_mesh(root/'gt_mesh.ply'),config)

if __name__=='__main__':main()
