"""Controlled kt0 TSDF and native-meshing tuning, separate from frozen baseline."""
import argparse
import json
from pathlib import Path
import copy
import numpy as np
import open3d as o3d
import yaml
from ..dataset.icl_nuim import load_icl_dataset
from ..evaluation.trajectory import read_tum_trajectory
from ..evaluation.surface import read_mesh, evaluate_surface
from ..reconstruction.tsdf import reconstruct_tsdf
from .icl_benchmark import subset, write_json, native_mesh
from .download_icl import disk_guard


def rank(result):
    return (-result['metrics']['f_scores']['0.02']['f_score'],result['metrics']['accuracy']['mean_m'])


def tsdf_candidate(dataset, settings, gt, visible, align, output, config):
    disk_guard(output)
    stats=reconstruct_tsdf(dataset,output,**settings,output_prefix='candidate')
    mesh=read_mesh(output/'candidate_tsdf_mesh.ply')
    metrics,_,_=evaluate_surface(mesh,gt,visible,align,sample_count=config['surface']['sample_count'],seed=config['surface']['seed'])
    # A sweep retains scores, parameters and a master only for finalists, not
    # hundreds of duplicate point clouds and preview files.
    (output/'candidate_pointcloud.ply').unlink()
    return {'settings':settings,'metrics':metrics,'mesh_vertices':len(mesh.vertices),'mesh_triangles':len(mesh.triangles)}


def sweep(outputs=Path('outputs/icl_nuim')):
    sequence='lr_kt0';root=outputs/sequence;config=yaml.safe_load(Path('config/icl_lr_kt0.yaml').read_text())
    data=load_icl_dataset(Path('data/icl_nuim')/sequence)
    ids=json.loads((root/'frame_ids.json').read_text());_,poses=read_tum_trajectory(root/'trajectory/estimated.txt')
    by_id={int(round(t*30)):p for t,p in zip(*read_tum_trajectory(root/'trajectory/estimated.txt'))}
    data=subset(data,ids,[by_id[i] for i in ids])
    gt=read_mesh(root/'gt_mesh.ply');visible=np.asarray(o3d.io.read_point_cloud(str(root/'gt_visible.ply')).points)
    align=np.array(json.loads((root/'trajectory/metrics.json').read_text())['alignment_se3'])
    target=outputs/'sweep';target.mkdir(exist_ok=True);results=[]
    for voxel in (.03,.02,.01):
        for multiplier in (2,3):
            for stride in (1,2):
                name=f'tsdf_v{int(voxel*1000)}_t{multiplier}_s{stride}'
                folder=target/name;folder.mkdir(exist_ok=True);record=folder/'result.json'
                if record.is_file():result=json.loads(record.read_text())
                else:
                    settings={'voxel_length':voxel,'sdf_trunc':voxel*multiplier,'frame_stride':stride}
                    result=tsdf_candidate(data,settings,gt,visible,align,folder,config);result.update({'name':name,'backend':'tsdf'})
                    write_json(record,result)
                results.append(result);print(name,result['metrics']['f_scores']['0.02']['f_score'],flush=True)
    finalists=sorted(results,key=rank)[:2]
    native=[]
    # Change surface-extraction resolution only; depth inputs, graph, voxel
    # preprocessing, coverage and alignment stay fixed across this sweep.
    for poisson in (.03,.02,.01):
        name=f'rtab_p{int(poisson*1000)}';folder=target/name;folder.mkdir(exist_ok=True);record=folder/'result.json'
        if record.is_file():result=json.loads(record.read_text())
        else:
            settings={**config['rtabmap'],'poisson_size':poisson}
            stats=native_mesh(root/'estimated_run/rtabmap.db',folder,settings,'2')
            mesh=read_mesh(folder/'mesh.ply');metrics,_,_=evaluate_surface(mesh,gt,visible,align,sample_count=100000)
            result={'name':name,'backend':'rtab','settings':settings,'metrics':metrics,'stats':stats};write_json(record,result)
        native.append(result)
    finalists+=sorted(native,key=rank)[:1]
    document={'development_sequence':'lr_kt0','selection':'highest_F@2cm_then_lowest_accuracy_mean',
              'frozen_baseline_unchanged':True,'results':results+native,'finalists':finalists,
              'heldout_sequences':['lr_kt1','lr_kt2','lr_kt3']}
    write_json(outputs/'sweep.json',document)
    keep={f['name'] for f in finalists}
    for result in results+native:
        if result['name'] not in keep:
            for p in (target/result['name']).glob('*.ply'):p.unlink()
    docs=Path('docs/results/icl_nuim');docs.mkdir(parents=True,exist_ok=True);write_json(docs/'sweep.json',document)
    return document


def validate_finalists(sequence,output,data,ids,poses,gt,visible,align,config):
    manifest=output.parent/'sweep.json'
    if not manifest.is_file():return {}
    results={};selected=subset(data,ids,poses)
    for finalist in json.loads(manifest.read_text())['finalists']:
        name=finalist['name'];folder=output/'tuning'/name;folder.mkdir(parents=True,exist_ok=True)
        if finalist['backend']=='tsdf':
            result=tsdf_candidate(selected,finalist['settings'],gt,visible,align,folder,config)
            (folder/'candidate_tsdf_mesh.ply').unlink()
        else:
            stats=native_mesh(output/'estimated_run/rtabmap.db',folder,finalist['settings'],'2')
            metrics,_,_=evaluate_surface(read_mesh(folder/'mesh.ply'),gt,visible,align,sample_count=100000)
            result={'settings':finalist['settings'],'metrics':metrics,'stats':stats};(folder/'mesh.ply').unlink()
        result.update({'name':name,'sequence':sequence,'role':'heldout_validation' if sequence!='lr_kt0' else 'development'})
        write_json(folder/'result.json',result);results[name]=result
    return results


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--outputs',type=Path,default=Path('outputs/icl_nuim'))
    args=p.parse_args();sweep(args.outputs)

if __name__=='__main__':main()
