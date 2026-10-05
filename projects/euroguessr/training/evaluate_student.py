"""Validation-only inference selection and private export. Test is explicit and locked."""
import argparse,json,time,hashlib
from pathlib import Path
import numpy as np
import torch
from train import ROOT,DATA,tensor,metrics,distance
from teacher_common import atomic_json,fingerprint
from cache_teacher import load_cache

def retrieval_candidates(query,refs,gps):
    q=query/(np.linalg.norm(query,axis=1,keepdims=True)+1e-8)
    refs=refs/(np.linalg.norm(refs,axis=1,keepdims=True)+1e-8)
    sim=q@refs.T
    order=np.argsort(-sim,axis=1)[:,:min(50,len(refs))]
    values=np.take_along_axis(sim,order,1)
    for k in [1,3,5,10,20,50]:
        k=min(k,len(refs))
        for temperature in ([20] if k==1 else [10,20,50]):
            w=np.exp((values[:,:k]-values[:,:1])*temperature);w/=w.sum(1,keepdims=True)
            yield k,temperature,(gps[order[:,:k]]*w[:,:,None]).sum(1)

def finalize(run_dir,prefix=None,audit_teacher=None):
    from student_train import Student,cached_prefix,all_features
    out=Path(run_dir);state=torch.load(out/'best.pt',weights_only=False);torch.set_num_threads(2)
    rows=json.loads((out/'manifest.json').read_text());gps=np.array([[float(r['latitude']),float(r['longitude'])] for r in rows])
    tr=np.array([i for i,r in enumerate(rows) if r['split']=='train']);va=np.array([i for i,r in enumerate(rows) if r['split']=='val'])
    model=Student(len(state['centers']),state['config'].get('tail_blocks',1));model.load_state_dict(state['model']);model.eval()
    if prefix is None:prefix=cached_prefix(model,rows,Path(state['arguments'].get('prefix_cache') or out/'prefix.npy'))
    features=all_features(model,prefix,np.arange(len(rows)))
    with torch.inference_mode():
        logits=model.head(features).numpy();projected=model.project(features).numpy()
    native=features.numpy();centers=np.asarray(state['centers']);candidates={'head':{'val':metrics(centers[logits[va].argmax(1)],gps[va]),'embedding_output':'embedding'}}
    for k,t,pred in retrieval_candidates(native[va],native[tr],gps[tr]):
        candidates[f'retrieval-{k}-t{t}']={'val':metrics(pred,gps[va]),'embedding_output':'embedding','retrieval_temperature':t}
    targets={};teacher_indices=[];teacher_refs=None
    if state['arguments'].get('teacher_cache'):
        _,targets=load_cache(Path(state['arguments']['teacher_cache']),rows,centers)
        teacher_indices=[i for i in tr if rows[i]['id'] in targets]
        teacher_refs=np.stack([targets[rows[i]['id']][0] for i in teacher_indices])
        for k,t,pred in retrieval_candidates(projected[va],teacher_refs,gps[teacher_indices]):
            candidates[f'distilled-{k}-t{t}']={'val':metrics(pred,gps[va]),'embedding_output':'projection','retrieval_temperature':t}
    gallery_refs=None;gallery_gps=None
    gallery_dir=ROOT/'artifacts/geoclip-direct/models'
    if not (gallery_dir/'references.json').exists():gallery_dir=ROOT/'models/geoclip'
    if targets and (gallery_dir/'references.json').exists():
        gallery_meta=json.loads((gallery_dir/'references.json').read_text())
        if gallery_meta.get('kind','').startswith('regular offline location grid'):
            gallery_refs=np.fromfile(gallery_dir/gallery_meta['feature_file'],dtype='<f4').reshape(gallery_meta['count'],gallery_meta['dimensions'])
            gallery_gps=np.asarray(gallery_meta['gps'])
            for k,t,pred in retrieval_candidates(projected[va],gallery_refs,gallery_gps):
                candidates[f'gallery-{k}-t{t}']={'val':metrics(pred,gps[va]),'embedding_output':'projection','retrieval_temperature':t}
    winner=min(candidates,key=lambda n:candidates[n]['val']['median_km'])
    selected=candidates[winner];constant=np.median(gps[tr],axis=0)
    candidates['constant-center']={'val':metrics(np.tile(constant,(len(va),1)),gps[va])}
    cosine=None
    if audit_teacher:
        _,audit=load_cache(audit_teacher,rows,centers,role='val')
        cos=[float(projected[i]@audit[r['id']][0]) for i,r in enumerate(rows) if r['id'] in audit]
        cosine={'n':len(cos),'mean_cosine':float(np.mean(cos))} if cos else None
    models=out/'models';models.mkdir(exist_ok=True)
    torch.onnx.export(model,torch.zeros(1,3,224,224),models/'model.onnx',input_names=['image'],output_names=['embedding','logits','projection'],opset_version=17)
    import onnxruntime as ort
    opts=ort.SessionOptions();opts.intra_op_num_threads=2;opts.inter_op_num_threads=1
    sess=ort.InferenceSession(str(models/'model.onnx'),sess_options=opts,providers=['CPUExecutionProvider'])
    sample=tensor(DATA/'images'/f"{rows[va[0]]['id']}.jpg").unsqueeze(0)
    with torch.inference_mode():pt=model(sample)
    onnxout=sess.run(None,{'image':sample.numpy()});parity=max(float(np.abs(a.numpy()-b).max()) for a,b in zip(pt,onnxout))
    if parity>1e-4:raise ValueError(f'ONNX parity failed: {parity}')
    times=[]
    for i in range(25):
        start=time.perf_counter();sess.run(None,{'image':sample.numpy()})
        if i>=5:times.append((time.perf_counter()-start)*1000)
    references=native[tr];indices=tr;reference_gps=gps[tr];kind='training image references'
    if winner.startswith('gallery-'):
        references=gallery_refs;indices=None;reference_gps=gallery_gps;kind='regular offline location grid; no ground-truth/image lookup'
    elif selected['embedding_output']=='projection':
        references=teacher_refs;indices=np.array(teacher_indices);reference_gps=gps[indices]
    references=references/(np.linalg.norm(references,axis=1,keepdims=True)+1e-8)
    references.astype('<f4').tofile(models/'references.f32')
    reference_meta={'feature_file':'references.f32','count':len(references),'dimensions':references.shape[1],'gps':reference_gps.tolist(),'kind':kind}
    if indices is not None:reference_meta['ids']=[rows[i]['id'] for i in indices]
    atomic_json(reference_meta,models/'references.json')
    model_sha=hashlib.sha256((models/'model.onnx').read_bytes()).hexdigest()
    metadata={'model_sha256':model_sha,'version':f'europe-v2-{out.name}-{state["epoch"]}-{model_sha[:12]}','architecture':'Tiny MobileNetV3-Small student distilled from GeoCLIP' if targets else 'GPS-supervised MobileNetV3-Small baseline','parameters':sum(p.numel() for p in model.parameters()),'method':winner,'embedding_output':selected['embedding_output'],'retrieval_temperature':selected.get('retrieval_temperature',20),'centers':centers.tolist(),'manifest_sha256':state['manifest_sha256'],'splits':{'train':len(tr),'val':len(va),'test':sum(r.get('cohort')=='fresh' for r in rows),'minimum_train_holdout_distance_km':25,'validation_block_degrees':3},'candidates':candidates,'onnx_max_absolute_error':parity,'onnx_bytes':(models/'model.onnx').stat().st_size,'reference_bytes':(models/'references.f32').stat().st_size,'native_cpu_latency_ms':{'median':float(np.median(times)),'p95':float(np.percentile(times,95)),'threads':2,'scope':'encoder + two heads; excludes image decode/retrieval'},'distillation':{'enabled':bool(targets),'teacher_images':len(targets),'teacher_cache_sha256':state['teacher_cache_sha256'],'weights':state['config'],'validation_representation':cosine},'precision':'FP32','human_benchmark':'Not measured','input':{'shape':[1,3,224,224],'resize':'stretch, half-pixel bilinear, no antialiasing','mean':[.485,.456,.406],'std':[.229,.224,.225]},'best_epoch':state['epoch'],'test_status':'not evaluated'}
    atomic_json(metadata,models/'metadata.json');atomic_json(metadata,out/'metrics.json')
    np.savez(out/'evaluation-features.npz',native=native,projection=projected,logits=logits)
    atomic_json({'winner':winner,'validation':selected['val'],'test_status':'not evaluated'},out/'selection.json')
    print(json.dumps({'winner':winner,'validation':selected['val'],'onnx_bytes':metadata['onnx_bytes'],'cosine':cosine}),flush=True)
    return metadata

def final_test(out):
    out=Path(out);models=out/'models';meta=json.loads((models/'metadata.json').read_text())
    locked=fingerprint({'model_sha256':hashlib.sha256((models/'model.onnx').read_bytes()).hexdigest(),'method':meta['method'],'manifest':meta['manifest_sha256'],'embedding_output':meta['embedding_output'],'temperature':meta['retrieval_temperature'],'centers':meta['centers'],'reference_sha256':hashlib.sha256((models/'references.f32').read_bytes()).hexdigest(),'reference_metadata_sha256':hashlib.sha256((models/'references.json').read_bytes()).hexdigest()})
    report_path=out/'test-report.json'
    if report_path.exists():
        report=json.loads(report_path.read_text())
        if report['selection_sha256']!=locked:raise ValueError('Test already inspected for another selection: use a fresh test cohort')
        meta['candidates'][meta['method']]['test']=report['test'];meta['candidates']['constant-center']['test']=report['constant_test'];meta['test_status']='locked fresh cohort evaluated once'
        atomic_json(meta,models/'metadata.json');atomic_json(meta,out/'metrics.json')
        print('Reusing locked test report',flush=True);return report
    rows=json.loads((out/'manifest.json').read_text());features=np.load(out/'evaluation-features.npz');te=np.array([i for i,r in enumerate(rows) if r.get('cohort')=='fresh'])
    if not len(te):raise ValueError('No fresh test cohort')
    actual=np.array([[float(rows[i]['latitude']),float(rows[i]['longitude'])] for i in te]);centers=np.asarray(meta['centers'])
    if meta['method']=='head':pred=centers[features['logits'][te].argmax(1)]
    else:
        r=json.loads((models/'references.json').read_text());refs=np.fromfile(models/r['feature_file'],dtype='<f4').reshape(r['count'],r['dimensions'])
        z=features['projection' if meta['embedding_output']=='projection' else 'native'][te]
        k=int(meta['method'].split('-')[1]);temperature=meta['retrieval_temperature']
        pred=next(p for kk,t,p in retrieval_candidates(z,refs,np.asarray(r['gps'])) if kk==k and t==temperature)
    report={'selection_sha256':locked,'method':meta['method'],'test_ids':[rows[i]['id'] for i in te],'test':metrics(pred,actual)}
    baseline=np.median(np.array([[float(r['latitude']),float(r['longitude'])] for r in rows if r['split']=='train']),axis=0)
    report['constant_test']=metrics(np.tile(baseline,(len(te),1)),actual)
    atomic_json(report,report_path)
    meta['candidates'][meta['method']]['test']=report['test'];meta['candidates']['constant-center']['test']=report['constant_test'];meta['test_status']='locked fresh cohort evaluated once'
    atomic_json(meta,models/'metadata.json');atomic_json(meta,out/'metrics.json');print(json.dumps(report['test']),flush=True)
    return report

def main():
    p=argparse.ArgumentParser();p.add_argument('--run-dir',type=Path,required=True);p.add_argument('--test',action='store_true');p.add_argument('--audit-teacher',type=Path);args=p.parse_args();torch.set_num_threads(2)
    if args.test:final_test(args.run_dir)
    else:finalize(args.run_dir,audit_teacher=args.audit_teacher)
if __name__=='__main__':main()
