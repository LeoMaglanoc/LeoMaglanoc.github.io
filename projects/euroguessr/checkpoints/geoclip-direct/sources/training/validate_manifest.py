"""Assert ID/sequence/block/buffer/public-photo contracts on any experiment."""
import argparse,json
from pathlib import Path
import numpy as np
from train import distance,ROOT
from teacher_common import atomic_json

def validate(rows):
    assert len({r['id'] for r in rows})==len(rows),'Duplicate IDs'
    sets={k:{r['id'] for r in rows if r['split']==k} for k in ['train','val','test']}
    sequences={k:{r['sequence'] for r in rows if r['split']==k} for k in sets}
    for a,b in [('train','val'),('train','test'),('val','test')]:
        assert not sets[a]&sets[b],f'{a}/{b} ID overlap'
        assert not sequences[a]&sequences[b],f'{a}/{b} sequence overlap'
    assert {r['block'] for r in rows if r['split']=='train'}.isdisjoint({r['block'] for r in rows if r['split']=='val'})
    gps=lambda split:np.array([[float(r['latitude']),float(r['longitude'])] for r in rows if r['split'] in split])
    a,b=gps(['train']),gps(['val','test'])
    minimum=min(float(distance(a[s:s+256,None],b[None]).min()) for s in range(0,len(a),256))
    assert minimum>=25,f'Buffer {minimum}'
    pack=json.loads((ROOT/'rounds.json').read_text());assert all(r['id'] in sets['test'] for r in pack),'Public photo leakage'
    return {'passed':True,'minimum_train_holdout_km':minimum,'splits':{k:len(v) for k,v in sets.items()},'public_test_images':len(pack),'fresh_test':sum(r.get('cohort')=='fresh' for r in rows)}
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--manifest',type=Path,required=True);p.add_argument('--output',type=Path);args=p.parse_args();result=validate(json.loads(args.manifest.read_text()))
    if args.output:atomic_json(result,args.output)
    print(json.dumps(result,indent=2))
