"""End-to-end ICL benchmark. All primary mapper comparisons share frame IDs."""
from __future__ import annotations
import argparse
import copy
from dataclasses import replace
import hashlib
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import threading
import tempfile
import time
import traceback

import cv2
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np
import open3d as o3d
import yaml

from ..dataset.icl_nuim import COUNTS, load_icl_dataset
from ..dataset.schema import Dataset
from ..evaluation.trajectory import evaluate_trajectories, poses_to_tum
from ..evaluation.surface import (Surface, official_gt_mesh, sample_surface, read_mesh, evaluate_surface,
                                 colorize_errors, distribution, check_pose_preservation)
from ..reconstruction.tsdf import read_color_depth, reconstruct_tsdf
from ..rtabmap.export import export_rtabmap_trajectory
from .download_icl import download, disk_guard, RESERVE


def write_json(path, value):
    path=Path(path);path.parent.mkdir(parents=True,exist_ok=True)
    temporary=None
    try:
        with tempfile.NamedTemporaryFile('w',dir=path.parent,prefix=path.name+'.',suffix='.tmp',delete=False) as stream:
            temporary=Path(stream.name)
            json.dump(value,stream,indent=2,allow_nan=False);stream.write('\n')
        temporary.chmod(0o644)
        temporary.replace(path)
    finally:
        if temporary is not None:temporary.unlink(missing_ok=True)


class DiskMonitor:
    """Stop subprocess group before it exhausts the filesystem."""
    def __init__(self,path):
        self.path=path;self.stop=threading.Event();self.failed=False;self.process=None
    def __enter__(self):
        disk_guard(self.path)
        def watch():
            while not self.stop.wait(2):
                if shutil.disk_usage(self.path).free < RESERVE:
                    self.failed=True
                    if self.process and self.process.poll() is None:
                        os.killpg(self.process.pid,signal.SIGTERM)
                    return
        self.thread=threading.Thread(target=watch,daemon=True);self.thread.start();return self
    def __exit__(self,*args):
        self.stop.set();self.thread.join()
        if self.failed:raise RuntimeError('Stopped benchmark to preserve 5 GiB disk reserve')


def command(args,log=None):
    print('+',' '.join(map(str,args)),flush=True)
    with DiskMonitor(Path('outputs')) as monitor:
        with Path(log).open('w') if log else open(os.devnull,'w') as stream:
            monitor.process=subprocess.Popen(list(map(str,args)),stdout=stream,stderr=subprocess.STDOUT,start_new_session=True)
            if monitor.process.wait()!=0:
                tail=Path(log).read_text(errors='replace')[-5000:] if log else ''
                raise RuntimeError(f'Command failed: {args}\n{tail}')


def replay(dataset,config,output,*,oracle=False,frame_ids=None):
    output.mkdir(parents=True,exist_ok=True);db=output/'rtabmap.db'
    log=(output/'ros.log').open('w')
    launch=subprocess.Popen(['ros2','launch','/workspace/scripts/rtabmap_icl.launch.py',f'database_path:={db.resolve()}',
                             f'oracle:={str(oracle).lower()}'],stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
    with DiskMonitor(output) as monitor:
        monitor.process=launch
        try:
            ready=False
            for _ in range(120):
                if launch.poll() is not None:break
                nodes=subprocess.run(['ros2','node','list'],capture_output=True,text=True,timeout=15).stdout
                if '/rtabmap' in nodes and (oracle or '/rgbd_odometry' in nodes):ready=True;break
                time.sleep(.5)
            if not ready:raise RuntimeError('RTAB-Map ROS launch failed: '+(output/'ros.log').read_text()[-3000:])
            args=['python3','-m','slam_pipeline.ros.dataset_player',dataset,'--config',config,'--rate','50.0' if oracle else '0.5',
                  '--publish-odometry',str(oracle).lower(),'--summary',output/'replay_summary.json']
            if frame_ids is not None:args+=['--frame-ids',frame_ids]
            if oracle:args+=['--wait-for-map']
            command(args,output/'replay.log')
            command(['python3','-m','slam_pipeline.scripts.wait_rtabmap',db,'--stable-polls','8','--poll-s','1',
                     '--timeout-s','240','--output',output/'drain_summary.json'],output/'drain.log')
        finally:
            if launch.poll() is None:
                os.killpg(launch.pid,signal.SIGINT)
                try:launch.wait(timeout=40)
                except subprocess.TimeoutExpired:
                    os.killpg(launch.pid,signal.SIGTERM);launch.wait(timeout=20)
            log.close()
    summary=json.loads((output/'replay_summary.json').read_text())
    if not oracle and summary['published_odometry_poses']!=0:
        raise RuntimeError('GT leakage: estimated run published external odometry')
    return db


def subset(dataset,ids,poses=None):
    by_id={frame.frame_id:frame for frame in dataset.frames}
    frames=[replace(by_id[i],T_world_camera=poses[j] if poses is not None else by_id[i].T_world_camera)
            for j,i in enumerate(ids)]
    return Dataset(dataset.root,dataset.intrinsics,frames,dataset.name,dataset.metadata)


def visible_reference(dataset,gt_mesh,output,config):
    """Fixed clean-depth visibility union, checked against the true surface."""
    surface=Surface(gt_mesh);cloud=o3d.geometry.PointCloud();oracle_errors=[]
    stride=int(config['surface']['visible_pixel_stride']);voxel=float(config['surface']['visible_voxel_m'])
    for i,frame in enumerate(dataset.frames):
        if i % 200 == 0:print(f"Visibility: {i}/{len(dataset)} clean frames",flush=True)
        _,depth=read_color_depth(frame);depth=depth[::stride,::stride]/frame.intrinsics.depth_scale
        v,u=np.mgrid[0:480:stride,0:640:stride];camera=frame.intrinsics
        valid=(depth>0)&(depth<camera.depth_trunc)
        points=np.stack([(u-camera.cx)*depth/camera.fx,(v-camera.cy)*depth/camera.fy,depth],axis=-1)[valid]
        world=points@frame.T_world_camera[:3,:3].T+frame.T_world_camera[:3,3]
        if i%30==0:
            oracle_errors.extend(surface.distance(world).tolist())
        cloud+=o3d.geometry.PointCloud(o3d.utility.Vector3dVector(world))
        if i%30==0:cloud=cloud.voxel_down_sample(voxel)
    cloud=cloud.voxel_down_sample(voxel)
    points=np.asarray(cloud.points);dist=surface.distance(points)
    # Snap the clean observed points onto actual GT triangles. Small pixel-grid
    # sampling gaps affect weighting only, not point-to-triangle recall distance.
    valid=dist<=.005
    points=surface.closest(points[valid])
    cloud=o3d.geometry.PointCloud(o3d.utility.Vector3dVector(points));cloud=cloud.voxel_down_sample(voxel)
    o3d.io.write_point_cloud(str(output/'gt_visible.ply'),cloud)
    stats={'clean_depth_to_gt':distribution(np.asarray(oracle_errors)),
           'visible_gt_points':len(cloud.points),'visible_voxel_m':voxel,'pixel_stride':stride,
           'clean_points_rejected':int((~valid).sum()),'reference_world_normalization':'fixed_OBJ_X_reflection',
           'visible_source':'all_clean_frames_and_official_global_GT', 'reference_sha256':hashlib.sha256(np.asarray(gt_mesh.vertices).tobytes()+np.asarray(gt_mesh.triangles).tobytes()).hexdigest()}
    write_json(output/'oracle_validation.json',stats)
    if stats['clean_depth_to_gt']['p95_m']>float(config['surface']['clean_gt_max_p95_m']):
        raise RuntimeError('Clean depth/GT mesh convention validation failed')
    return np.asarray(cloud.points).copy(),stats


def native_mesh(database,output,settings,optimization):
    output.mkdir(parents=True,exist_ok=True)
    args=['stdbuf','-oL','-eL','rtabmap-export','--mesh','--opt',optimization,'--output','native','--output_dir',output]
    for key,value in settings.items():args += ['--'+key,str(value)]
    args.append(database);command(args,output/'export.log')
    generated=output/'native_mesh.ply'
    if not generated.is_file():raise RuntimeError(f'Native mesh export missing: {generated}')
    generated.replace(output/'mesh.ply')
    mesh=read_mesh(output/'mesh.ply')
    return {'backend':'rtabmap_native_poisson','settings':settings,'optimization':optimization,
            'mesh_vertices':len(mesh.vertices),'mesh_triangles':len(mesh.triangles),'command':list(map(str,args))}


def evaluate_variant(name,mesh,gt,visible,alignment,output,config,stats):
    target=output/name;target.mkdir(parents=True,exist_ok=True)
    o3d.io.write_triangle_mesh(str(target/'mesh.ply'),mesh)
    metrics,accuracy,completeness=evaluate_surface(mesh,gt,visible,alignment,
        sample_count=int(config['surface']['sample_count']),seed=int(config['surface']['seed']))
    stats['mesh_path']=str(target/'mesh.ply')
    stats.pop('pointcloud_path',None)
    write_json(target/'stats.json',stats);write_json(target/'surface_metrics.json',metrics)
    heatmap=colorize_errors(mesh,gt,alignment)
    o3d.io.write_triangle_mesh(str(target/'mesh_error.ply'),heatmap)
    from .icl_web_export import write_glb
    write_glb(heatmap,target/'mesh_error.glb')
    fig,axes=plt.subplots(1,2,figsize=(10,3.5))
    for ax,dist,title in zip(axes,[accuracy,completeness],['Accuracy','Completeness']):
        ax.hist(np.minimum(dist,.10)*100,bins=50,range=(0,10));ax.set(title=title,xlabel='Distance (cm; clipped at 10)',ylabel='Samples')
    fig.tight_layout();fig.savefig(target/'surface_error_histogram.png',dpi=120);plt.close(fig)
    return metrics


def run_sequence(sequence,data_root,outputs, resume=False):
    started=time.monotonic();download(sequence,data_root)
    root=data_root/sequence;output=outputs/sequence;output.mkdir(parents=True,exist_ok=True)
    config_path=Path('config')/f'icl_{sequence}.yaml';config=yaml.safe_load(config_path.read_text())
    previous=json.loads((output/'config.json').read_text()) if (output/'config.json').is_file() else None
    reusable=resume and previous==config
    write_json(output/'config.json',config)
    shutil.copy2(root/'downloads.json',output/'downloads.json')
    clean=load_icl_dataset(root,condition='clean');noisy=load_icl_dataset(root)
    gt=official_gt_mesh(data_root/'reference/living-room.obj')
    o3d.io.write_triangle_mesh(str(output/'gt_mesh.ply'),gt)
    if reusable and (output/'oracle_validation.json').is_file() and (output/'gt_visible.ply').is_file():
        oracle=json.loads((output/'oracle_validation.json').read_text())
        if oracle['clean_depth_to_gt']['p95_m']>config['surface']['clean_gt_max_p95_m']:raise RuntimeError('Cached convention gate failed')
        visible=np.asarray(o3d.io.read_point_cloud(str(output/'gt_visible.ply')).points).copy()
    else:
        visible,oracle=visible_reference(clean,gt,output,config)
    stamps=np.array([f.timestamp_ns/1e9 for f in noisy.frames]);poses=[f.T_world_camera for f in noisy.frames]
    trajectory=output/'trajectory';trajectory.mkdir(exist_ok=True)
    poses_to_tum(stamps,poses,trajectory/'gt.txt')
    # Limit input by the benchmark's evaluable sensor-frame manifest, never by
    # any GT pose values. Estimated loader still never opens a pose file.
    write_json(output/'input_frame_ids.json',[f.frame_id for f in noisy.frames])
    estimated_db=output/'estimated_run/rtabmap.db'
    if not (reusable and estimated_db.is_file() and (output/'estimated_run/drain_summary.json').is_file()):
        estimated_db=replay(root,config_path,output/'estimated_run',frame_ids=output/'input_frame_ids.json')
    est_stamps,est_poses,node_ids=export_rtabmap_trajectory(estimated_db,trajectory/'estimated.txt',save_in_database=True)
    usable=[j for j,t in enumerate(est_stamps) if int(round(t*30)) in {f.frame_id for f in noisy.frames}]
    est_stamps=est_stamps[usable];est_poses=[est_poses[j] for j in usable]
    ids=[int(round(t*30)) for t in est_stamps]
    if len(set(ids))!=len(ids) or any(i not in {f.frame_id for f in noisy.frames} for i in ids):raise RuntimeError('Invalid estimate/frame correspondence')
    if len(ids)<3:raise RuntimeError('Insufficient estimated poses')
    write_json(output/'frame_ids.json',ids)
    metrics=evaluate_trajectories(stamps,poses,est_stamps,est_poses,trajectory)
    metrics['input_frames']=len(noisy);metrics['graph_frame_coverage']=len(ids)/len(noisy)
    write_json(trajectory/'metrics.json',metrics)
    command(['python3','-m','slam_pipeline.scripts.crosscheck_evo',trajectory/'gt.txt',trajectory/'estimated.txt',
             trajectory/'metrics.json','--output',trajectory/'evo_crosscheck.json'],trajectory/'evo.log')
    evo=json.loads((trajectory/'evo_crosscheck.json').read_text())
    if not evo['within_1e-5_tolerance']:raise RuntimeError('evo cross-check failed')
    alignment=np.array(metrics['alignment_se3'])
    gt_db=output/'gt_run/rtabmap.db'
    if not (reusable and gt_db.is_file() and (output/'gt_run/drain_summary.json').is_file()):
        gt_db=replay(root,config_path,output/'gt_run',oracle=True,frame_ids=output/'frame_ids.json')
    gt_stamps,gt_poses,_=export_rtabmap_trajectory(gt_db,trajectory/'rtab_gt.txt',optimization='raw')
    gt_ids=[int(round(t*30)) for t in gt_stamps]
    if gt_ids!=ids:raise RuntimeError('Native GT graph did not preserve comparison frame IDs')
    replay_stats=json.loads((output/'estimated_run/replay_summary.json').read_text())
    if replay_stats['published_odometry_poses']!=0:raise RuntimeError('Estimated replay contains external odometry')
    preservation=check_pose_preservation([next(f.T_world_camera for f in noisy.frames if f.frame_id==i) for i in ids],gt_poses)
    write_json(output/'gt_pose_validation.json',preservation)
    cloud_check=output/'native_source_cloud_validation.json'
    if sequence=='lr_kt0' and not (reusable and cloud_check.is_file() and json.loads(cloud_check.read_text()).get('passed') is True):
        from .check_icl_native_cloud import check_native_cloud
        check_native_cloud(output,noisy,ids,gt,config)
    summaries={}
    for name,source,selected,align in [
        ('tsdf_clean_gt',clean,subset(clean,ids),np.eye(4)),
        ('tsdf_gt',noisy,subset(noisy,ids),np.eye(4)),
        ('tsdf_estimated',noisy,subset(noisy,ids,est_poses),alignment),
        ('tsdf_clean_gt_full',clean,clean,np.eye(4))]:
        target=output/name;disk_guard(output)
        if reusable and (target/'surface_metrics.json').is_file():
            summaries[name]=json.loads((target/'surface_metrics.json').read_text());continue
        settings=config['tsdf'];stats=reconstruct_tsdf(selected,target,**settings,output_prefix='fusion')
        mesh=read_mesh(target/'fusion_tsdf_mesh.ply')
        (target/'fusion_tsdf_mesh.ply').unlink();(target/'fusion_pointcloud.ply').unlink()
        stats.update({'backend':'open3d_tsdf','settings':settings,'source_frame_ids':ids if name!='tsdf_clean_gt_full' else 'all',
                      'depth_condition':'clean' if 'clean' in name else 'noisy','pose_source':'estimated' if 'estimated' in name else 'GT'})
        summaries[name]=evaluate_variant(name,mesh,gt,visible,align,output,config,stats)
    for name,db,opt,align in [('rtab_estimated',estimated_db,'2',alignment),('rtab_gt',gt_db,'3',np.eye(4))]:
        if reusable and (output/name/'surface_metrics.json').is_file():
            summaries[name]=json.loads((output/name/'surface_metrics.json').read_text());continue
        stats=native_mesh(db,output/name,config['rtabmap'],opt)
        stats.update({'source_frame_ids':ids,'pose_source':'estimated' if 'estimated' in name else 'GT','depth_condition':'noisy'})
        summaries[name]=evaluate_variant(name,read_mesh(output/name/'mesh.ply'),gt,visible,align,output,config,stats)
    from .icl_sweep import validate_finalists
    tuning=validate_finalists(sequence,output,noisy,ids,est_poses,gt,visible,alignment,config)
    result={'tuning_validation':tuning,'sequence':sequence,'status':'passed','trajectory':metrics,'oracle':oracle,'gt_pose_validation':preservation,
            'conditions':summaries,'shared_frame_count':len(ids),'input_frames':len(noisy),
            'runtime_s':time.monotonic()-started,'provenance':{'open3d':o3d.__version__,'numpy':np.__version__,
            'rtabmap_version':subprocess.run(['rtabmap-export','--version'],capture_output=True,text=True).stdout.strip(),
            'replay_rate':.5,'oracle_replay_policy':'per_frame_map_acknowledgement',
            'estimated_GT_odometry_messages':replay_stats['published_odometry_poses']}}
    write_json(output/'evaluation/surface_metrics.json',summaries)
    write_json(output/'result.json',result)
    report_sequence(result,output/'report.md')
    print(f'{sequence} PASSED in {result["runtime_s"]:.1f}s',flush=True)
    return result


def table(rows):
    lines=['| Sequence | Poses | Mapper | ATE cm | Accuracy cm | Completeness cm | F@2cm | F@5cm |',
           '|---|---|---|---:|---:|---:|---:|---:|']
    for row in rows:
        lines.append('| '+ ' | '.join(str(v) for v in row)+' |')
    return '\n'.join(lines)


def report_sequence(result,path):
    rows=[]
    for name,surface in result['conditions'].items():
        if name.endswith('_full'):continue
        rows.append([result['sequence'],'estimated' if 'estimated' in name else 'GT',name,
            f"{result['trajectory']['ate_rmse_m']*100:.3f}" if 'estimated' in name else '0',
            f"{surface['accuracy']['mean_m']*100:.3f}",f"{surface['completeness']['mean_m']*100:.3f}",
            f"{surface['f_scores']['0.02']['f_score']:.3f}",f"{surface['f_scores']['0.05']['f_score']:.3f}"])
    Path(path).write_text(f"# ICL-NUIM {result['sequence']} — synthetic benchmark\n\n"+table(rows)+
        f"\n\nShared mapper frames: {result['shared_frame_count']}/{result['input_frames']}. "
        "Completeness uses the same full-sequence clean-depth visible GT reference for every method. "
        "Accuracy uses exact GT triangles, deterministic area-weighted samples, and trajectory-only rigid alignment. "
        "GT poses were checked against raw native export. No scale fit or independent ICP.\n")


def aggregate(outputs):
    results=[json.loads(p.read_text()) for p in sorted(outputs.glob('lr_kt*/result.json'))]
    rows=[];conditions={}
    for result in results:
        if result['status']!='passed':continue
        for name in ('tsdf_estimated','rtab_estimated','tsdf_gt','rtab_gt','tsdf_clean_gt'):
            s=result['conditions'][name]
            values=[result['trajectory']['ate_rmse_m']*100 if 'estimated' in name else 0,
                    s['accuracy']['mean_m']*100,s['completeness']['mean_m']*100,
                    s['f_scores']['0.02']['f_score'],s['f_scores']['0.05']['f_score']]
            rows.append([result['sequence'],'estimated' if 'estimated' in name else 'GT',name,*[f'{v:.3f}' for v in values]])
            conditions.setdefault(name,[]).append(values)
    means={name:np.mean(values,axis=0).tolist() for name,values in conditions.items()}
    for name,values in means.items():rows.append(['MEAN','estimated' if 'estimated' in name else 'GT',name,*[f'{v:.3f}' for v in values]])
    summary={'protocol':'icl_nuim_v1','sequences':results,'means':means,'complete':len(results)==4 and all(r['status']=='passed' for r in results),
             'mean_columns':['ate_cm','accuracy_cm','completeness_cm','f2','f5']}
    write_json(outputs/'summary.json',summary)
    tracking=['| Sequence | Graph/input frames | ATE cm | RPE translation cm | RPE rotation rad | Clean depth → GT p95 cm |',
              '|---|---:|---:|---:|---:|---:|']
    for result in results:
        if result['status']!='passed':continue
        m=result['trajectory']
        tracking.append(f"| {result['sequence']} | {result['shared_frame_count']}/{result['input_frames']} | "
                        f"{m['ate_rmse_m']*100:.3f} | {m['rpe_translation_rmse_m']*100:.3f} | "
                        f"{m['rpe_rotation_rmse_rad']:.6f} | {result['oracle']['clean_depth_to_gt']['p95_m']*100:.3f} |")
    cloud_path=outputs/'lr_kt0/native_source_cloud_validation.json'
    cloud_note=''
    if cloud_path.is_file():
        cloud=json.loads(cloud_path.read_text())
        cloud_note=f"\n\nThe kt0 native GT cloud agrees with independent PNG unprojection to {cloud['native_to_independently_unprojected_cloud']['p95_m']*1000:.2f} mm at p95. "
        cloud_note+=f"The native and independent voxel clouds have GT-distance means of {cloud['native_cloud_to_GT']['mean_m']*100:.2f} and {cloud['independent_cloud_to_GT']['mean_m']*100:.2f} cm, with a substantial noisy-depth outlier tail. "
        cloud_note+='These diagnostics sample voxel points uniformly, not surface area, and cannot be subtracted from mesh scores. '
        cloud_note+='[Native input check](native_source_cloud_validation.json).\n'
    (outputs/'report.md').write_text('# ICL-NUIM — noisy RGB-D benchmark\n\n'+table(rows)+
        '\n\nClean-depth GT diagnostic rows are included separately from the noisy 2×2 comparison. '
        'Means weight each sequence equally. Failures are preserved in JSON; incomplete sets are not a complete benchmark. '
        'kt0 is the development/tuning sequence; kt1–kt3 validate chosen parameters.\n\n'+
        '\n'.join(tracking)+'\n\nGraph coverage reports the retained keyframes, not dense frame-wise tracking coverage. '
        'RPE compares consecutive associated graph poses. Raw clean depth has a small residual against the reference; '
        'the clean TSDF error therefore includes that residual as well as fusion and discretization. '
        'Diagnostic differences are not assumed to add linearly.\n'+cloud_note)
    docs=Path('docs/results/icl_nuim');docs.mkdir(parents=True,exist_ok=True)
    shutil.copy2(outputs/'summary.json',docs/'summary.json');shutil.copy2(outputs/'report.md',docs/'report.md')
    if cloud_path.is_file():shutil.copy2(cloud_path,docs/'native_source_cloud_validation.json')
    for result in results:
        name=result['sequence'];target=docs/name;target.mkdir(exist_ok=True)
        for file in ('report.md','downloads.json','oracle_validation.json','gt_pose_validation.json','native_source_cloud_validation.json'):
            if (outputs/name/file).is_file():shutil.copy2(outputs/name/file,target/file)
        for condition in ('tsdf_clean_gt','tsdf_gt','tsdf_estimated','rtab_gt','rtab_estimated'):
            source=outputs/name/condition/'surface_error_histogram.png'
            if source.is_file():shutil.copy2(source,target/f'{condition}_surface_error_histogram.png')
        if (outputs/name/'trajectory/trajectory_comparison.png').is_file():
            shutil.copy2(outputs/name/'trajectory/trajectory_comparison.png',target/'trajectory_comparison.png')
    return summary


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('sequence',choices=[*COUNTS,'all'])
    p.add_argument('--data-root',type=Path,default=Path('data/icl_nuim'));p.add_argument('--outputs',type=Path,default=Path('outputs/icl_nuim'))
    p.add_argument('--keep-data',action='store_true');p.add_argument('--resume',action='store_true')
    args=p.parse_args();failed=False
    for sequence in COUNTS if args.sequence=='all' else [args.sequence]:
        result=args.outputs/sequence/'result.json'
        current=yaml.safe_load((Path('config')/f'icl_{sequence}.yaml').read_text())
        recorded=args.outputs/sequence/'config.json'
        if args.resume and result.is_file() and recorded.is_file() and json.loads(result.read_text()).get('status')=='passed' and json.loads(recorded.read_text())==current:continue
        try:run_sequence(sequence,args.data_root,args.outputs,resume=args.resume)
        except Exception as error:
            failed=True;traceback.print_exc();write_json(result,{'sequence':sequence,'status':'failed','error':str(error)})
        finally:
            # Keep kt0 until web export and tuning; remove other regenerated
            # sensor packages and DBs immediately, preserving master meshes.
            if not args.keep_data and sequence!='lr_kt0':
                root=(args.data_root/sequence).resolve()
                if root.is_relative_to(args.data_root.resolve()) and root.exists():shutil.rmtree(root)
                for run in ('estimated_run','gt_run'):
                    (args.outputs/sequence/run/'rtabmap.db').unlink(missing_ok=True)
            aggregate(args.outputs)
        if shutil.disk_usage(args.outputs).free < RESERVE:
            failed=True
            print('Stopping to preserve the 5 GiB disk reserve',flush=True)
            break
    if failed:raise SystemExit(1)

if __name__=='__main__':main()
