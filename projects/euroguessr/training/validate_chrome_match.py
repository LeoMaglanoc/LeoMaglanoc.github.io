"""Verify an actual Chrome JSON download against native CPU inference and scoring.
This reads exported UI evidence; it does not automate or substitute for Chrome.
JPEG decoder and backend numeric differences are reported explicitly.
"""
import argparse,json,time
from pathlib import Path
import numpy as np
import onnxruntime as ort
from train import ROOT,tensor,distance,nearest
from teacher_common import atomic_json

def main():
    p=argparse.ArgumentParser();p.add_argument('--match',type=Path,required=True);p.add_argument('--models',type=Path,required=True);p.add_argument('--output',type=Path,required=True);args=p.parse_args()
    match=json.loads(args.match.read_text());meta=json.loads((args.models/'metadata.json').read_text());pack={r['id']:r for r in json.loads((ROOT/'rounds.json').read_text())}
    assert match['modelVersion']==meta['version'] and match['method']==meta['method']
    if meta.get('model_sha256'):assert match['modelSha256']==meta['model_sha256']
    if meta.get('prediction_sha256'):assert match['modelFingerprint']==meta['prediction_sha256']
    assert match['rules']['rounds']==5 and len(match['rounds'])==5
    ref=json.loads((args.models/'references.json').read_text());refs=np.fromfile(args.models/ref['feature_file'],dtype='<f4').reshape(ref['count'],ref['dimensions'])
    opts=ort.SessionOptions();opts.intra_op_num_threads=2;opts.inter_op_num_threads=1;sess=ort.InferenceSession(str(args.models/'model.onnx'),sess_options=opts,providers=['CPUExecutionProvider'])
    processor=None
    if meta.get('preprocessing')=='clip-bicubic-center-crop':
        from transformers import AutoProcessor
        from teacher_common import CLIP_REVISION
        processor=AutoProcessor.from_pretrained('openai/clip-vit-large-patch14',revision=CLIP_REVISION)
    checks=[]
    from PIL import Image
    for r in match['rounds']:
        image=ROOT/pack[r['imageId']]['image']
        if processor:
            with Image.open(image) as photo:x=processor(images=photo.convert('RGB'),return_tensors='np')['pixel_values']
        else:x=tensor(image).unsqueeze(0).numpy()
        outputs=dict(zip([v.name for v in sess.get_outputs()],sess.run(None,{'image':x})))
        if meta['method']=='head':pred=np.asarray(meta['centers'])[outputs['logits'][0].argmax()]
        else:pred=nearest(outputs[meta.get('embedding_output','embedding')],refs,np.asarray(ref['gps']),int(meta['method'].split('-')[1]),meta.get('retrieval_temperature',20))[0]
        observed=np.array([r['ai']['lat'],r['ai']['lon']]);actual=np.array([r['actual']['lat'],r['actual']['lon']]);ai_km=float(distance(observed,actual));assert np.isclose(ai_km,r['aiKm'],atol=1e-6);assert round(5000*np.exp(-ai_km/1500))==r['aiScore']
        if r['human']:
            human_km=float(distance(np.array([r['human']['lat'],r['human']['lon']]),actual));assert np.isclose(human_km,r['humanKm'],atol=1e-6);assert round(5000*np.exp(-human_km/1500))==r['humanScore']
        else:assert r['humanScore']==0 and r['humanKm'] is None
        checks.append({'round':r['round'],'id':r['imageId'],'native_browser_coordinate_difference_km':float(distance(pred,observed)),'browser_inference_ms':r['inferenceMs']})
    report={'model':meta['version'],'method':meta['method'],'checks':checks,'score_contract':'passed','human_total':sum(r['humanScore'] for r in match['rounds']),'ai_total':sum(r['aiScore'] for r in match['rounds']),'maximum_native_browser_coordinate_difference_km':max(r['native_browser_coordinate_difference_km'] for r in checks),'scope':'actual UI JSON; native CPU vs browser WASM, includes JPEG decoder differences; synthetic guesses, not human evaluation'}
    atomic_json(report,args.output);print(json.dumps(report,indent=2),flush=True)
if __name__=='__main__':main()
