"""Balanced multi-shard expansion with spatial buffer and fresh test cohort.
Plans holdouts BEFORE downloads. Public legacy photos remain test-only.
"""
import argparse,json,hashlib,time,collections
from concurrent.futures import ThreadPoolExecutor,as_completed
from pathlib import Path
import numpy as np
from prepare import ROOT, DATA, metadata, index, fetch, REVISION
from train import distance
from teacher_common import atomic_json, fingerprint

def balanced(rows, count):
    groups={}
    for r in sorted(rows,key=lambda r:fingerprint(r['id'])): groups.setdefault(r['country'],[]).append(r)
    result=[]; seen=set()
    for depth in range(max(map(len,groups.values()),default=0)):
        for country in sorted(groups):
            g=groups[country]
            if depth>=len(g): continue
            r=g[depth]
            if r['sequence'] in seen: continue
            seen.add(r['sequence']); result.append(dict(r))
            if len(result)>=count:return result
    return result

def spatial_safe(train,held):
    h=np.array([[float(r['latitude']),float(r['longitude'])] for r in held])
    safe=[]
    for start in range(0,len(train),256):
        batch=train[start:start+256];gps=np.array([[float(r['latitude']),float(r['longitude'])] for r in batch])
        keep=distance(gps[:,None],h[None]).min(1)>=25
        safe.extend(r for r,k in zip(batch,keep) if k)
    return safe

def main():
    p=argparse.ArgumentParser();p.add_argument('--train',type=int,default=8500);p.add_argument('--val',type=int,default=1000);p.add_argument('--test',type=int,default=600);p.add_argument('--shards',type=int,default=3);p.add_argument('--workers',type=int,default=6);p.add_argument('--exclude-test-manifest',type=Path,action='append',default=[]);p.add_argument('--run-dir',type=Path,default=ROOT/'artifacts/geoclip-overnight');args=p.parse_args()
    out=args.run_dir;out.mkdir(parents=True,exist_ok=True);(DATA/'images').mkdir(parents=True,exist_ok=True)
    start=time.time();entries={};candidates={}
    for source in ['train','test']:
        source_entries={}
        for shard in range(args.shards):
            for id,entry in index(source,shard).items(): source_entries[id]={**entry,'shard':shard,'source_split':source}
        entries.update(source_entries)
        candidates[source]=[{**r,'shard':source_entries[r['id']]['shard'],'source_split':source} for r in metadata(source) if r['id'] in source_entries]
    if (out/'planned-manifest.json').exists():
        planned=json.loads((out/'planned-manifest.json').read_text())
        print('Resume fixed plan',len(planned),flush=True)
    else:
        old=json.loads((ROOT/'checkpoints/current/manifest.json').read_text())
        legacy=[{**r,'cohort':'legacy-inspected'} for r in old if r['split']=='test']
        old_ids={r['id'] for r in old};held_seq={r['sequence'] for r in legacy}
        # A new run must not silently call previously inspected V2 tests 'fresh'.
        excluded_ids=set(old_ids);excluded_sequences=set(held_seq)
        previous=list((ROOT/'checkpoints').glob('*/manifest.json'))+args.exclude_test_manifest
        for path in previous:
            for row in json.loads(path.read_text()):
                if row['split']=='test':excluded_ids.add(row['id']);excluded_sequences.add(row['sequence'])
        held_seq.update(excluded_sequences)
        fresh=balanced([r for r in candidates['test'] if r['id'] not in excluded_ids and r['sequence'] not in held_seq],args.test)
        for r in fresh:r.update(split='test',cohort='fresh')
        held_seq.update(r['sequence'] for r in fresh)
        pool=[r for r in candidates['train'] if r['sequence'] not in held_seq]
        for r in pool:
            block=f"{int(float(r['latitude'])//3)}:{int(float(r['longitude'])//3)}"
            r['block']=block
            r['split']='val' if int(hashlib.sha256(block.encode()).hexdigest()[:8],16)%5==0 else 'train'
        val=balanced([r for r in pool if r['split']=='val'],args.val)
        held_seq.update(r['sequence'] for r in val)
        train=balanced(spatial_safe([r for r in pool if r['split']=='train' and r['sequence'] not in held_seq],legacy+fresh+val),args.train)
        planned=sorted(train+val+legacy+fresh,key=lambda r:(r['split'],r['id']))
        if len(train)<args.train//2 or len(fresh)<args.test//2:raise ValueError('Not enough balanced data')
        atomic_json(planned,out/'planned-manifest.json')
    completed=[]
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures={pool.submit(fetch,(r,entries[r['id']])):r for r in planned}
        for i,f in enumerate(as_completed(futures)):
            try:completed.append(f.result())
            except Exception as e:print('FAILED',futures[f]['id'],str(e),flush=True)
            if (i+1)%100==0:
                atomic_json(sorted(completed,key=lambda r:(r['split'],r['id'])),out/'download-progress.json')
                print('Downloaded',i+1,'/',len(planned),'seconds',round(time.time()-start),flush=True)
    missing=set(r['id'] for r in planned)-set(r['id'] for r in completed)
    if missing:
        atomic_json(sorted(missing),out/'missing-images.json');raise RuntimeError(f'{len(missing)} images missing; rerun to resume before training')
    atomic_json(planned,out/'manifest.json')
    summary={'revision':REVISION,'shards':args.shards,'splits':dict(collections.Counter(r['split'] for r in planned)),'countries':dict(collections.Counter(r['country'] for r in planned)),'sequences':len(set(r['sequence'] for r in planned)),'fresh_test':sum(r.get('cohort')=='fresh' for r in planned),'seconds':time.time()-start,'manifest_sha256':hashlib.sha256(json.dumps(planned,sort_keys=True).encode()).hexdigest()}
    atomic_json(summary,out/'data-summary.json');print(json.dumps(summary),flush=True)
if __name__=='__main__':main()
