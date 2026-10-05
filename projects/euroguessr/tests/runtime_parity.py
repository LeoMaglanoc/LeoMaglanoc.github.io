"""Compare downloaded Chrome audit outputs against native ONNX with identical pixels."""
import argparse,json,sys
from pathlib import Path
import numpy as np
import onnxruntime as ort
from PIL import Image
from transformers import AutoProcessor
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'training'))
from train import ROOT,distance,nearest
from teacher_common import atomic_json,CLIP_REVISION
p=argparse.ArgumentParser();p.add_argument('--audit',type=Path,required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--models',type=Path,default=ROOT/'models/geoclip');args=p.parse_args()
audit=json.loads(args.audit.read_text());folder=args.models;meta=json.loads((folder/'metadata.json').read_text());assert audit['metadata']['model_sha256']==meta['model_sha256']
opts=ort.SessionOptions();opts.intra_op_num_threads=2;opts.inter_op_num_threads=1;sess=ort.InferenceSession(str(folder/'model.onnx'),sess_options=opts,providers=['CPUExecutionProvider'])
refs_meta=json.loads((folder/'references.json').read_text());refs=np.fromfile(folder/'references.f32',dtype='<f4').reshape(refs_meta['count'],512);gps=np.array(refs_meta['gps']);processor=AutoProcessor.from_pretrained('openai/clip-vit-large-patch14',revision=CLIP_REVISION)
results=[]
for sample in audit['results']:
    x=np.array(sample['pixels'],dtype=np.float32).reshape(1,3,224,224);wasm=np.array(sample['embedding'],dtype=np.float32);native=sess.run(None,{'image':x})[0][0]
    same={'name':sample['name'],'same_input_max_embedding_error':float(np.abs(wasm-native).max()),'same_input_embedding_cosine':float(wasm@native),'same_input_coordinate_difference_km':float(distance(nearest(wasm[None],refs,gps,10,20)[0],nearest(native[None],refs,gps,10,20)[0]))}
    if sample['name'].startswith('images/'):
        with Image.open(ROOT/sample['name']) as image:pil=processor(images=image.convert('RGB'),return_tensors='np')['pixel_values']
        original=sess.run(None,{'image':pil})[0][0]
        same.update(jpeg_preprocessing_max_input_error=float(np.abs(x-pil).max()),jpeg_preprocessing_mean_input_error=float(np.abs(x-pil).mean()),jpeg_changed_input_fraction=float(np.mean(x!=pil)),jpeg_decode_embedding_cosine=float(native@original),jpeg_decode_coordinate_difference_km=float(distance(nearest(native[None],refs,gps,10,20)[0],nearest(original[None],refs,gps,10,20)[0])))
    results.append(same)
report={'model':meta['version'],'results':results,'scope':'Two actual Chrome WASM audit runs; exact tensors separate backend differences from JPEG decoding. Legacy gameplay photo only; no fresh-test tuning.'};atomic_json(report,args.output);print(json.dumps(report,indent=2))
if any(r['same_input_embedding_cosine']<.9999 for r in results):raise AssertionError('Material native/WASM backend difference')
