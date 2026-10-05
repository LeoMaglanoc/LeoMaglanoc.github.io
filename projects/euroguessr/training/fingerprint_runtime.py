"""Seal a predictor identity over graph, external weights, gallery and strategy.
A graph-only SHA is insufficient for models with external weights. This helper
is idempotent and changes metadata only; prediction bytes/config remain intact.
"""
import argparse,json,hashlib
from pathlib import Path
from teacher_common import atomic_json,fingerprint

def seal(models):
    models=Path(models);meta=json.loads((models/'metadata.json').read_text())
    names=['model.onnx',*[r['path'] for r in meta.get('external_data',[])],'references.f32','references.json']
    hashes={name:hashlib.sha256((models/name).read_bytes()).hexdigest() for name in names}
    meta['onnx_bytes']=sum((models/name).stat().st_size for name in names if name not in ['references.f32','references.json'])
    meta['reference_bytes']=(models/'references.f32').stat().st_size
    meta['download_bytes']=meta['onnx_bytes']+meta['reference_bytes']
    root=Path(__file__).resolve().parents[1]
    preprocess='clip-preprocess.js' if meta.get('preprocessing')=='clip-bicubic-center-crop' else 'preprocess.js'
    sources=[root/'src'/preprocess,root/'src/geo.js',root/'src/inference.worker.js',*(root/'vendor').glob('ort*.js'),*(root/'vendor').glob('ort*.mjs'),*(root/'vendor').glob('ort*.wasm')]
    code_hashes={p.relative_to(root).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in sources}
    meta['inference_source_sha256']=code_hashes
    definition={'files':hashes,'inference_source_sha256':code_hashes,'method':meta['method'],'embedding_output':meta.get('embedding_output','embedding'),'retrieval_temperature':meta.get('retrieval_temperature',20),'centers':meta.get('centers'),'preprocessing':meta.get('preprocessing',meta.get('input'))}
    meta['prediction_sha256']=fingerprint(definition);meta['runtime_sha256']=hashes
    meta['model_sha256']=hashes['model.onnx'];meta['reference_sha256']=hashes['references.f32'];meta['reference_metadata_sha256']=hashes['references.json']
    meta.setdefault('model_version_base',meta['version']);meta['version']=meta['model_version_base']+'-'+meta['prediction_sha256'][:12]
    atomic_json(meta,models/'metadata.json');return meta

def main():
    p=argparse.ArgumentParser();p.add_argument('--models',type=Path,required=True);p.add_argument('--metrics-out',type=Path);args=p.parse_args();meta=seal(args.models)
    if args.metrics_out:atomic_json(meta,args.metrics_out)
    print(meta['version'],flush=True)
if __name__=='__main__':main()
