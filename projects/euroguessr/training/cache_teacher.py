"""Batched offline GeoCLIP targets with atomic chunks and strict safe-resume identity."""
import argparse, json, signal, time, hashlib
from pathlib import Path
import numpy as np
import torch
from train import ROOT, DATA
from teacher_common import VERSION, PREPROCESS, fingerprint, manifest_fingerprint, atomic_json, balanced_subset, embeddings
stop=False

def interrupted(*_):
    global stop
    stop=True

def cache_identity(rows, selected, centers, temperature, role):
    return {'format_version':2,'teacher':VERSION,'preprocessing':PREPROCESS,
        'manifest_sha256':manifest_fingerprint(rows),'selected_ids':[r['id'] for r in selected],
        'image_sha256':{r['id']:hashlib.sha256((DATA/'images'/f"{r['id']}.jpg").read_bytes()).hexdigest() for r in selected},
        'centers':np.asarray(centers).tolist(),'temperature':temperature,'role':role,'dimension':512}

def load_cache(path, rows=None, centers=None, role='train'):
    path=Path(path); meta=json.loads((path/'index.json').read_text())
    identity=meta['identity']
    if fingerprint(identity)!=meta['identity_sha256']: raise ValueError('Cache identity corrupted')
    if identity['role']!=role: raise ValueError('Teacher cache role mismatch')
    if rows is not None:
        if identity['manifest_sha256']!=manifest_fingerprint(rows): raise ValueError('Teacher manifest mismatch')
        allowed={r['id'] for r in rows if r['split']==role}
        if not set(identity['selected_ids'])<=allowed: raise ValueError('Teacher split leakage')
        for id,sha in identity['image_sha256'].items():
            if hashlib.sha256((DATA/'images'/f'{id}.jpg').read_bytes()).hexdigest()!=sha: raise ValueError('Teacher image changed')
    if centers is not None and (np.asarray(identity['centers']).shape!=np.asarray(centers).shape or not np.allclose(identity['centers'],centers)):
        raise ValueError('Teacher cells mismatch')
    result={}
    for chunk in meta['chunks']:
        raw=(path/chunk['file']).read_bytes()
        if hashlib.sha256(raw).hexdigest()!=chunk['sha256']: raise ValueError('Teacher chunk checksum mismatch')
        with np.load(path/chunk['file'],allow_pickle=False) as values:
            z=values['embeddings'];probs=values['probabilities'];ids=values['ids'].tolist()
        if ids!=chunk['ids'] or z.shape!=(len(ids),512) or probs.shape!=(len(ids),len(identity['centers'])): raise ValueError('Teacher dimensions mismatch')
        if not np.isfinite(z).all() or not np.allclose(np.linalg.norm(z,axis=1),1,atol=1e-4): raise ValueError('Invalid normalized teacher embeddings')
        if not np.isfinite(probs).all() or np.any(probs<0) or not np.allclose(probs.sum(1),1,atol=1e-4): raise ValueError('Invalid probabilities')
        for id,a,b in zip(ids,z,probs):
            if id in result or id not in identity['selected_ids']: raise ValueError('Duplicate/unselected teacher ID')
            result[id]=(a,b)
    return meta,result

def main():
    p=argparse.ArgumentParser()
    p.add_argument('--manifest',type=Path,required=True)
    p.add_argument('--cells',type=Path,required=True,help='JSON array or object with centers')
    p.add_argument('--output',type=Path,required=True,help='Cache directory')
    p.add_argument('--subset',type=Path,help='JSON training ID list; otherwise balanced selection')
    p.add_argument('--count',type=int,default=2000)
    p.add_argument('--batch-size',type=int,default=4)
    p.add_argument('--threads',type=int,default=2)
    p.add_argument('--temperature',type=float,default=2)
    p.add_argument('--role',choices=['train','val'],default='train',help='Separate val cache ONLY for representation evaluation')
    p.add_argument('--stop-at',help='Timezone-aware ISO timestamp')
    args=p.parse_args()
    if args.batch_size<1 or args.temperature<=0 or args.count<1: raise ValueError('Positive batch/count/temperature required')
    from datetime import datetime
    deadline=datetime.fromisoformat(args.stop_at).timestamp() if args.stop_at else float('inf')
    if args.stop_at and datetime.fromisoformat(args.stop_at).tzinfo is None: raise ValueError('Deadline requires timezone')
    rows=json.loads(args.manifest.read_text()); raw=json.loads(args.cells.read_text()); centers=raw['centers'] if isinstance(raw,dict) else raw
    if args.subset:
        ids=json.loads(args.subset.read_text()); lookup={r['id']:r for r in rows}
        if len(set(ids))!=len(ids): raise ValueError('Duplicate subset IDs')
        selected=[lookup[id] for id in ids]
    elif args.role=='train': selected=balanced_subset(rows,centers,args.count)
    else:
        # Held-out representation audit is explicitly separated from training caches.
        selected=sorted([r for r in rows if r['split']=='val'],key=lambda r:fingerprint(r['id']))[:args.count]
    if not selected or any(r['split']!=args.role for r in selected): raise ValueError('Teacher subset contains wrong split')
    identity=cache_identity(rows,selected,centers,args.temperature,args.role)
    path=args.output;path.mkdir(parents=True,exist_ok=True)
    if (path/'index.json').exists():
        meta,done=load_cache(path,rows,centers,args.role)
        if identity!=meta['identity']: raise ValueError('Resume identity differs: use a new cache directory')
    else:
        meta={'identity':identity,'identity_sha256':fingerprint(identity),'chunks':[],'elapsed_seconds':0};done={}
    pending=[r for r in selected if r['id'] not in done]
    if not pending: print('Cache complete',len(done),flush=True);return
    torch.set_num_threads(args.threads)
    from teacher_common import load_teacher
    teacher=load_teacher()
    signal.signal(signal.SIGINT,interrupted);signal.signal(signal.SIGTERM,interrupted)
    start=time.monotonic(); previous=meta['elapsed_seconds']
    with torch.inference_mode():
        location=torch.nn.functional.normalize(teacher.location_encoder(torch.tensor(centers,dtype=torch.float32)),dim=1)
        meta['location_embeddings_sha256']=hashlib.sha256(location.numpy().tobytes()).hexdigest()
        np.save(path/'location-embeddings.npy',location.numpy())
        atomic_json(meta,path/'index.json')
        for i in range(0,len(pending),args.batch_size):
            if stop or time.time()>=deadline: break
            batch=pending[i:i+args.batch_size]; z=embeddings(teacher,batch)
            probs=(teacher.logit_scale.exp()*(z@location.T)/args.temperature).softmax(-1).numpy()
            name=f'chunk-{len(meta["chunks"]):06d}.npz';tmp=path/(name+'.tmp')
            with tmp.open('wb') as out: np.savez_compressed(out,ids=np.array([r['id'] for r in batch]),embeddings=z.numpy(),probabilities=probs)
            tmp.replace(path/name)
            meta['chunks'].append({'file':name,'ids':[r['id'] for r in batch],'sha256':hashlib.sha256((path/name).read_bytes()).hexdigest()})
            meta['elapsed_seconds']=previous+time.monotonic()-start
            meta['completed_images']=len(done)+i+len(batch)
            atomic_json(meta,path/'index.json')
            print('Teacher cached',meta['completed_images'],'/',len(selected),'seconds',round(meta['elapsed_seconds'],1),flush=True)
        meta['complete']=meta.get('completed_images',len(done))==len(selected)
        atomic_json(meta,path/'index.json')
    print('Saved. Same command safely resumes.',flush=True)
if __name__=='__main__': main()
