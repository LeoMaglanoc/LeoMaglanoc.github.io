"""Precomputed ICL viewer bundles; scores always use unsimplified master meshes."""
import copy
import json
from pathlib import Path
import struct
import numpy as np
import open3d as o3d


def write_glb(mesh,path):
    """Minimal embedded glTF with geometry, normals and measured/error colors."""
    mesh.compute_vertex_normals()
    v=np.asarray(mesh.vertices,dtype='<f4');n=np.asarray(mesh.vertex_normals,dtype='<f4')
    c=np.asarray(mesh.vertex_colors,dtype='<f4')
    if len(c)!=len(v):c=np.full(v.shape,.7,dtype='<f4')
    # glTF COLOR_0 is linear; observed RGB and matplotlib colors are sRGB.
    # https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html
    c=np.clip(c,0,1)
    c=np.where(c<=.04045,c/12.92,((c+.055)/1.055)**2.4).astype('<f4')
    indices=np.asarray(mesh.triangles,dtype='<u4').ravel()
    arrays=[v,n,c,indices];views=[];accessors=[];binary=b''
    for i,array in enumerate(arrays):
        data=array.tobytes();views.append({'buffer':0,'byteOffset':len(binary),'byteLength':len(data),'target':34963 if i==3 else 34962})
        accessor={'bufferView':i,'componentType':5125 if i==3 else 5126,'count':len(array),'type':'SCALAR' if i==3 else 'VEC3'}
        if i==0:accessor.update({'min':v.min(axis=0).tolist(),'max':v.max(axis=0).tolist()})
        accessors.append(accessor);binary+=data
    doc={'asset':{'version':'2.0','generator':'offline-slam'},'scene':0,'scenes':[{'nodes':[0]}],
         'nodes':[{'mesh':0}],'meshes':[{'primitives':[{'attributes':{'POSITION':0,'NORMAL':1,'COLOR_0':2},'indices':3,'material':0}]}],
         'materials':[{'pbrMetallicRoughness':{'baseColorFactor':[1,1,1,1],'metallicFactor':0,'roughnessFactor':1},'doubleSided':True}],
         'buffers':[{'byteLength':len(binary)}],'bufferViews':views,'accessors':accessors}
    data=json.dumps(doc,separators=(',',':')).encode();data+=b' '*((-len(data))%4);binary+=b'\0'*((-len(binary))%4)
    total=12+8+len(data)+8+len(binary)
    Path(path).write_bytes(struct.pack('<4sII',b'glTF',2,total)+struct.pack('<I4s',len(data),b'JSON')+data+
                          struct.pack('<I4s',len(binary),b'BIN\0')+binary)


def export_bundle(outputs=Path('outputs/icl_nuim'), public=Path('web/public/demos/icl_nuim')):
    import argparse
    import shutil
    import subprocess
    import cv2
    from scipy.spatial.transform import Rotation
    from ..evaluation.surface import read_mesh, colorize_errors
    from ..evaluation.trajectory import read_tum_trajectory
    from ..dataset.icl_nuim import load_icl_dataset
    from ..reconstruction.tsdf import read_color_depth
    from .icl_benchmark import write_json, command
    summary=json.loads((outputs/'summary.json').read_text())
    if not summary['complete']:raise RuntimeError('Refusing to publish incomplete ICL benchmark')
    public.mkdir(parents=True,exist_ok=True);root=outputs/'lr_kt0'
    result=json.loads((root/'result.json').read_text());align=np.array(result['trajectory']['alignment_se3'])
    selection=prepare_selected_tuning(outputs,summary)
    for name in ('tsdf_tuned_gt','tsdf_tuned_estimated'):
        result['conditions'][name]=json.loads((root/name/'surface_metrics.json').read_text())
    gt=read_mesh(root/'gt_mesh.ply');write_glb(gt,public/'gt.glb')
    metadata={'title':'ICL-NUIM · living room','synthetic':True,'sequence':'lr_kt0','input_frames':result['input_frames'],
              'shared_frame_count':result['shared_frame_count'],'variants':{},'gt_mesh':'gt.glb',
              'coordinate_convention':'official_global_GT_world_Y_up', 'heatmap_cap_m':.10,
              'default_mapper':'tsdf_tuned' if selection['validated_improvement'] else 'tsdf',
              'tuning_selection':selection}
    for pose_source in ('estimated','gt'):
        timestamps,poses=read_tum_trajectory(root/'trajectory'/('estimated.txt' if pose_source=='estimated' else 'gt.txt'))
        samples=[]
        for timestamp,pose in zip(timestamps,poses):
            p=align@pose if pose_source=='estimated' else pose
            samples.append({'timestamp':float(timestamp-timestamps[0]),'position':p[:3,3].tolist(),
                            'quaternion':Rotation.from_matrix(p[:3,:3]).as_quat().tolist()})
        write_json(public/f'trajectory_{pose_source}.json',{'source':f'icl_{pose_source}_trajectory','units':'meters','samples':samples})
        if pose_source=='gt':
            first=poses[0];position=first[:3,3];target=position+first[:3,2]*2
            metadata['camera']={'position':position.tolist(),'target':target.tolist(),'up':[0,1,0]}
    for mapper in ('tsdf','rtab','tsdf_tuned'):
        for poses in ('estimated','gt'):
            name=f'{mapper}_{poses}';transform=align if poses=='estimated' else np.eye(4)
            mesh=read_mesh(root/name/'mesh.ply');master_triangles=len(mesh.triangles)
            if master_triangles>100000:mesh=mesh.simplify_quadric_decimation(100000)
            mesh.remove_degenerate_triangles();mesh.remove_duplicated_triangles();mesh.compute_vertex_normals()
            error=colorize_errors(mesh,gt,transform);write_glb(error,public/f'{name}_error.glb')
            colored=copy.deepcopy(mesh).transform(transform);write_glb(colored,public/f'{name}.glb')
            variant={'mesh':f'{name}.glb','geometry_mesh':f'{name}.glb','error_mesh':f'{name}_error.glb','trajectory':f'trajectory_{poses}.json',
                     'master_triangles':master_triangles,'web_triangles':len(mesh.triangles),
                     'metrics':result['conditions'][name], 'ate_rmse_m':result['trajectory']['ate_rmse_m'] if poses=='estimated' else 0,
                     'color_representation':'observed_vertex_RGB' if mapper.startswith('tsdf') else 'native_UV_texture'}
            variant['integration_frame_count']=len(json.loads((root/'frame_ids.json').read_text())[::selection['settings']['frame_stride']]) if mapper=='tsdf_tuned' else result['shared_frame_count']
            # RTAB UV texturing is a display export from the SAME frozen graph,
            # never the simplified geometry used for benchmark scores.
            if mapper=='rtab':
                staging=root/'web_textures'/name;staging.mkdir(parents=True,exist_ok=True)
                db=root/('estimated_run' if poses=='estimated' else 'gt_run')/'rtabmap.db'
                args=['rtabmap-export','--mesh','--texture','--opt','2' if poses=='estimated' else '3',
                      '--output','display','--output_dir',staging,'--max_polygons','100000','--poisson_size','0.02',
                      '--voxel','0.01','--decimation','2','--min_range','0','--max_range','6','--min_cluster','0',
                      '--texture_size','2048','--texture_count','1','--texture_depth_error','0.04','--edge_bleeding_error','0',db]
                command(args,staging/'export.log')
                source=staging/'display_mesh.obj';lines=[]
                for line in source.read_text().splitlines():
                    parts=line.split()
                    if parts and parts[0] in {'v','vn'}:
                        values=np.array(list(map(float,parts[1:4])))
                        values=transform[:3,:3]@values+(transform[:3,3] if parts[0]=='v' else 0)
                        line=parts[0]+' '+' '.join(f'{v:.9g}' for v in values)
                    lines.append(line)
                (staging/'aligned.obj').write_text('\n'.join(lines)+'\n')
                variant['mesh']=f'{name}_textured.glb'
            metadata['variants'][name]=variant
    # Browser RGB/depth videos retain the original upright presentation. Sensor
    # normalization belongs only to the offline loader, not the video UI.
    data=load_icl_dataset(Path('data/icl_nuim/lr_kt0'),condition='noisy',require_groundtruth=False)
    input_ids=set(json.loads((root/'input_frame_ids.json').read_text()))
    data.frames=[frame for frame in data.frames if frame.frame_id in input_ids]
    from matplotlib import colormaps
    for kind in ('rgb','depth'):
        destination=public/('demo.mp4' if kind=='rgb' else 'depth.mp4')
        if not destination.is_file():
            writer=cv2.VideoWriter(str(destination),cv2.VideoWriter_fourcc(*'mp4v'),30,(640,480))
            if not writer.isOpened():raise RuntimeError('Video encoder unavailable')
            for frame in data.frames:
                if kind=='rgb':image=cv2.imread(str(frame.rgb_path))
                else:
                    depth=cv2.imread(str(frame.depth_path),-1)/5000
                    image=(colormaps['turbo'](np.clip(depth/6,0,1))[:,:,:3]*255).astype(np.uint8)
                    image[depth==0]=0;image=cv2.cvtColor(image,cv2.COLOR_RGB2BGR)
                writer.write(image)
            writer.release()
    metadata['tuning_summary']='The table preserves the frozen baseline; the validated TSDF setting is also available in the viewer. Twelve TSDF settings and three native meshing resolutions were tested on kt0. Three finalists were validated on kt1–kt3; full parameters and scores are downloadable.'
    for name in ('summary.json','report.md','sweep.json','selection.json'):
        shutil.copy2(outputs/name,public/name)
    shutil.copy2(root/'native_source_cloud_validation.json',public/'native_source_cloud_validation.json')
    write_json(public/'metadata.json',metadata)
    attribution=('ICL-NUIM synthetic RGB-D benchmark. A. Handa, T. Whelan, J. McDonald, A. Davison, ICRA 2014.\n'
                 'Living-room scene: Jaime Vives Piqueres.\nSource: https://www.doc.ic.ac.uk/~ahanda/VaFRIC/iclnuim.html\n'
                 'License: CC BY 3.0 https://creativecommons.org/licenses/by/3.0/\n'
                 'Derived simplified meshes, UV textures, error colors and videos. Scores use unsimplified master geometry.\n')
    (public/'attribution.txt').write_text(attribution)
    docs=Path('docs/results/icl_nuim')
    (docs/'attribution.txt').write_text(attribution)
    print(f'Exported precomputed ICL bundle to {public}',flush=True)


def prepare_selected_tuning(outputs,summary):
    from ..dataset.icl_nuim import load_icl_dataset
    from ..evaluation.trajectory import read_tum_trajectory
    from ..evaluation.surface import read_mesh
    from ..reconstruction.tsdf import reconstruct_tsdf
    from .icl_benchmark import subset, write_json, evaluate_variant
    import yaml
    sweep=json.loads((outputs/'sweep.json').read_text())
    candidates=[f for f in sweep['finalists'] if f['backend']=='tsdf'];scores={}
    for candidate in candidates:
        values=[candidate['metrics']['f_scores']['0.02']['f_score']]
        values += [s['tuning_validation'][candidate['name']]['metrics']['f_scores']['0.02']['f_score']
                   for s in summary['sequences'] if s['sequence']!='lr_kt0']
        scores[candidate['name']]=float(np.mean(values))
    selected=max(candidates,key=lambda c:scores[c['name']])
    heldout=[s['tuning_validation'][selected['name']]['metrics']['f_scores']['0.02']['f_score']
             for s in summary['sequences'] if s['sequence']!='lr_kt0']
    baseline=[s['conditions']['tsdf_estimated']['f_scores']['0.02']['f_score']
              for s in summary['sequences'] if s['sequence']!='lr_kt0']
    selection={'selected':selected['name'],'settings':selected['settings'],'candidate_mean_f2':scores,
               'heldout_mean_f2':float(np.mean(heldout)),'baseline_heldout_mean_f2':float(np.mean(baseline)),
               'validated_improvement':bool(np.mean(heldout)>np.mean(baseline)),
               'selection_protocol':'kt0 finalists, compare kt1-kt3 validation, equal sequence weighting'}
    tuning_rows=['| Sequence | Configuration | Accuracy cm | Completeness cm | F@2cm |',
                 '|---|---|---:|---:|---:|']
    all_scores={}
    for candidate in sweep['finalists']:
        records=[('lr_kt0',candidate['metrics'])]+[(s['sequence'],s['tuning_validation'][candidate['name']]['metrics'])
                  for s in summary['sequences'] if s['sequence']!='lr_kt0']
        values=[]
        for sequence,metric in records:
            value=[metric['accuracy']['mean_m']*100,metric['completeness']['mean_m']*100,metric['f_scores']['0.02']['f_score']]
            values.append(value)
            tuning_rows.append(f"| {sequence} | {candidate['name']} | {value[0]:.3f} | {value[1]:.3f} | {value[2]:.3f} |")
        mean=np.mean(values,axis=0);all_scores[candidate['name']]=float(mean[2])
        tuning_rows.append(f"| MEAN | {candidate['name']} | {mean[0]:.3f} | {mean[1]:.3f} | {mean[2]:.3f} |")
    selection['all_finalist_mean_f2']=all_scores
    selection['best_finalist']=max(all_scores,key=all_scores.get)
    root=outputs/'lr_kt0';config=yaml.safe_load(Path('config/icl_lr_kt0.yaml').read_text())
    gt=read_mesh(root/'gt_mesh.ply');visible=np.asarray(o3d.io.read_point_cloud(str(root/'gt_visible.ply')).points)
    alignment=np.array(json.loads((root/'trajectory/metrics.json').read_text())['alignment_se3'])
    ids=json.loads((root/'frame_ids.json').read_text());data=load_icl_dataset(Path('data/icl_nuim/lr_kt0'))
    for poses in ('estimated','gt'):
        name=f'tsdf_tuned_{poses}';folder=root/name;folder.mkdir(exist_ok=True)
        if (folder/'surface_metrics.json').is_file() and (folder/'stats.json').is_file():
            previous=json.loads((folder/'stats.json').read_text())
            if previous.get('selected_configuration')==selected['name'] and previous.get('settings')==selected['settings']:continue
        if poses=='estimated':
            mesh=read_mesh(outputs/'sweep'/selected['name']/'candidate_tsdf_mesh.ply')
            stats={'settings':selected['settings'],'source_frame_ids':ids[::selected['settings']['frame_stride']],'selected_configuration':selected['name'],
                   'master_triangles':len(mesh.triangles)}
        else:
            stats=reconstruct_tsdf(subset(data,ids),folder,**selected['settings'],output_prefix='selected')
            mesh=read_mesh(folder/'selected_tsdf_mesh.ply')
            (folder/'selected_tsdf_mesh.ply').unlink();(folder/'selected_pointcloud.ply').unlink()
            stats.update({'settings':selected['settings'],'source_frame_ids':ids[::selected['settings']['frame_stride']],'selected_configuration':selected['name']})
        evaluate_variant(name,mesh,gt,visible,alignment if poses=='estimated' else np.eye(4),root,config,stats)
    write_json(outputs/'selection.json',selection);write_json(Path('docs/results/icl_nuim/selection.json'),selection)
    report=(outputs/'report.md').read_text().split('\n## Controlled tuning\n')[0]
    report+='\n## Controlled tuning\n\n'+ '\n'.join(tuning_rows)
    report+=f"\n\nSelected TSDF configuration: `{selected['name']}`, parameters `{json.dumps(selected['settings'],sort_keys=True)}`. "
    report+=f"Held-out mean F@2cm: {selection['heldout_mean_f2']:.3f}; baseline: {selection['baseline_heldout_mean_f2']:.3f}. "
    report+='kt0 scores select finalists; kt1–kt3 validate them. The complete 15-configuration development sweep is in `sweep.json`. '
    report+='Baseline metrics are frozen. Increasing mesh resolution alone does not guarantee greater accuracy.\n'
    (outputs/'report.md').write_text(report);(Path('docs/results/icl_nuim')/'report.md').write_text(report)
    return selection


if __name__=='__main__':
    export_bundle()
