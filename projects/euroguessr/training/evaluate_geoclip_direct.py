"""Compare quantized direct GeoCLIP to FP32 on validation, then lock final test."""
import argparse,json,hashlib,time
from pathlib import Path
import numpy as np
import torch
import onnxruntime as ort
from PIL import Image
from train import ROOT,DATA,metrics
from teacher_common import atomic_json,fingerprint,manifest_fingerprint
from evaluate_student import retrieval_candidates

def main():
    p=argparse.ArgumentParser();p.add_argument('--manifest',type=Path,required=True);p.add_argument('--models',type=Path,default=ROOT/'artifacts/geoclip-direct/models');p.add_argument('--run-dir',type=Path,default=ROOT/'artifacts/geoclip-direct');p.add_argument('--count',type=int);p.add_argument('--compare-fp32',action='store_true');p.add_argument('--test',action='store_true');args=p.parse_args();torch.set_num_threads(2)
    rows=json.loads(args.manifest.read_text());meta=json.loads((args.models/'metadata.json').read_text());ref=json.loads((args.models/'references.json').read_text());refs=np.fromfile(args.models/ref['feature_file'],dtype='<f4').reshape(ref['count'],ref['dimensions']);gps=np.asarray(ref['gps'])
    if args.test:
        if args.count or args.compare_fp32:raise ValueError('Final test evaluates the full fresh cohort only')
        if not meta.get('validation_selection'):raise ValueError('Select on validation before test')
        if meta['validation_selection']['manifest_sha256']!=manifest_fingerprint(rows):raise ValueError('Test manifest differs from validation selection')
        selected=[r for r in rows if r.get('cohort')=='fresh']
        if (args.run_dir/'test-report.json').exists():raise ValueError('Direct model test already evaluated; preserve the report')
        from fingerprint_runtime import seal
        meta=seal(args.models)
    else:
        if (args.run_dir/'test-report.json').exists():raise ValueError('Test already inspected: use a new experiment and fresh test cohort')
        selected=sorted([r for r in rows if r['split']=='val'],key=lambda r:fingerprint(r['id']))
    if args.count:selected=selected[:args.count]
    opts=ort.SessionOptions();opts.intra_op_num_threads=2;opts.inter_op_num_threads=1
    sess=ort.InferenceSession(str(args.models/'model.onnx'),sess_options=opts,providers=['CPUExecutionProvider'])
    from transformers import AutoProcessor
    from teacher_common import CLIP_REVISION
    processor=AutoProcessor.from_pretrained('openai/clip-vit-large-patch14',revision=CLIP_REVISION)
    teacher=None
    if args.compare_fp32:
        from teacher_common import load_teacher
        teacher=load_teacher()
        # Exact image-only parameter count, including GeoCLIP projection.
        meta['parameters']=sum(v.numel() for v in teacher.image_encoder.CLIP.vision_model.parameters())+sum(v.numel() for v in teacher.image_encoder.CLIP.visual_projection.parameters())+sum(v.numel() for v in teacher.image_encoder.mlp.parameters())
    embeddings=[];fp=[];latencies=[]
    for i,r in enumerate(selected):
        with Image.open(DATA/'images'/f"{r['id']}.jpg") as image:x=processor(images=image.convert('RGB'),return_tensors='np')['pixel_values']
        start=time.perf_counter();z=sess.run(None,{'image':x})[0][0];latencies.append((time.perf_counter()-start)*1000)
        if z.shape!=(512,) or not np.isfinite(z).all() or not np.isclose(np.linalg.norm(z),1,atol=1e-4):raise ValueError('Invalid direct embedding')
        embeddings.append(z)
        if teacher:
            with torch.inference_mode():fp.append(torch.nn.functional.normalize(teacher.image_encoder(torch.from_numpy(x)),dim=1).numpy()[0])
        if i%20==0:print('Direct validation/test',i,'/',len(selected),flush=True)
    z=np.asarray(embeddings);actual=np.array([[float(r['latitude']),float(r['longitude'])] for r in selected]);candidates={}
    if args.test:
        k=int(meta['method'].split('-')[1]);t=meta['retrieval_temperature'];pred=next(p for kk,tt,p in retrieval_candidates(z,refs,gps) if kk==k and tt==t)
        report={'test':metrics(pred,actual),'method':meta['method'],'test_ids':[r['id'] for r in selected],'manifest_sha256':manifest_fingerprint(rows),'prediction_sha256':meta['prediction_sha256'],'runtime_sha256':meta['runtime_sha256']}
        atomic_json(report,args.run_dir/'test-report.json');meta['candidates'][meta['method']]['test']=report['test'];meta['test_status']='locked fresh cohort evaluated once'
    else:
        for k,t,pred in retrieval_candidates(z,refs,gps):candidates[f'retrieval-{k}-t{t}']={'val':metrics(pred,actual)}
        winner=min(candidates,key=lambda n:candidates[n]['val']['median_km']);meta.update(method=winner,retrieval_temperature=int(winner.split('-t')[1]),candidates=candidates,validation_selection={'manifest_sha256':manifest_fingerprint(rows),'ids':[r['id'] for r in selected]})
        report={'validation':candidates[winner]['val'],'method':winner,'manifest_sha256':manifest_fingerprint(rows),'n':len(selected),'native_cpu_latency_ms':{'median':float(np.median(latencies[1:])),'p95':float(np.percentile(latencies[1:],95)),'threads':2}}
        if fp:
            fp=np.asarray(fp);report['quantization_mean_cosine']=float(np.sum(z*fp,axis=1).mean());report['fp32_top1_validation']=metrics(gps[(fp@refs.T).argmax(1)],actual);report['int8_top1_validation']=metrics(gps[(z@refs.T).argmax(1)],actual)
        name='sanity-validation.json' if args.count else 'validation-report.json';atomic_json(report,args.run_dir/name)
    atomic_json(meta,args.models/'metadata.json');print(json.dumps(report,indent=2),flush=True)
if __name__=='__main__':main()
