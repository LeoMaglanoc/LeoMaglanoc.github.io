"""Measure the preserved deployed model on the new validation cohort, never test for selection."""
import argparse,json,time
from pathlib import Path
import numpy as np
import onnxruntime as ort
from train import ROOT,DATA,tensor,metrics
from evaluate_student import retrieval_candidates
from teacher_common import atomic_json,manifest_fingerprint

def main():
    p=argparse.ArgumentParser();p.add_argument('--manifest',type=Path,required=True);p.add_argument('--models',type=Path,default=ROOT/'artifacts/geoclip-overnight/baseline/models');p.add_argument('--output',type=Path,required=True);args=p.parse_args()
    rows=json.loads(args.manifest.read_text());val=[r for r in rows if r['split']=='val']
    meta=json.loads((args.models/'metadata.json').read_text());ref=json.loads((args.models/'references.json').read_text());refs=np.fromfile(args.models/ref['feature_file'],dtype='<f4').reshape(ref['count'],ref['dimensions'])
    opts=ort.SessionOptions();opts.intra_op_num_threads=2;opts.inter_op_num_threads=1
    sess=ort.InferenceSession(str(args.models/'model.onnx'),sess_options=opts,providers=['CPUExecutionProvider']);features=[];logits=[]
    for i,r in enumerate(val):
        a,b=sess.run(None,{'image':tensor(DATA/'images'/f"{r['id']}.jpg").unsqueeze(0).numpy()});features.append(a[0]);logits.append(b[0])
        if i%100==0:print('Baseline validation',i,'/',len(val),flush=True)
    gps=np.array([[float(r['latitude']),float(r['longitude'])] for r in val])
    if meta['method']=='head':pred=np.asarray(meta['centers'])[np.asarray(logits).argmax(1)]
    else:
        k=int(meta['method'].split('-')[1]);temperature=meta.get('retrieval_temperature',20)
        pred=next(pred for kk,t,pred in retrieval_candidates(np.asarray(features),refs,np.asarray(ref['gps'])) if kk==k and t==temperature)
    report={'version':meta['version'],'method':meta['method'],'manifest_sha256':manifest_fingerprint(rows),'validation':metrics(pred,gps),'original_metrics':meta['candidates'][meta['method']],'original_splits':meta['splits'],'onnx_bytes':(args.models/'model.onnx').stat().st_size,'reference_bytes':(args.models/ref['feature_file']).stat().st_size}
    atomic_json(report,args.output);print(json.dumps(report['validation']),flush=True)
if __name__=='__main__':main()
