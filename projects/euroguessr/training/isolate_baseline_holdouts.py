"""Remove holdout neighbors of V1 training BEFORE any V2 model selection.
New students already have their own buffer. This gives the preserved model a
comparable, spatially isolated validation/fresh-test cohort too. Removed rows
are discarded, never reassigned to training. Legacy game tests stay intact.
"""
import argparse,json
from pathlib import Path
import numpy as np
from train import ROOT,distance
from teacher_common import atomic_json,manifest_fingerprint

def main():
    p=argparse.ArgumentParser();p.add_argument('--run-root',type=Path,default=ROOT/'artifacts/geoclip-overnight');args=p.parse_args();root=args.run_root
    if (root/'baseline-holdout-isolation.json').exists():
        report=json.loads((root/'baseline-holdout-isolation.json').read_text())
        if manifest_fingerprint(json.loads((root/'manifest.json').read_text()))!=report['manifest_after']:raise ValueError('Isolated manifest changed')
        print('Reusing isolated holdouts',flush=True);return
    if any((root/f'grid-{n}/last.pt').exists() for n in [64,96,128]):raise ValueError('Holdouts must be isolated before model selection')
    rows=json.loads((root/'manifest.json').read_text());ref=json.loads((root/'baseline/models/references.json').read_text());gps=np.asarray(ref['gps']);old=json.loads((ROOT/'checkpoints/current/manifest.json').read_text());ids=set(ref['ids']);sequences={r['sequence'] for r in old if r['id'] in ids}
    kept=[];removed=[];minimum=float('inf')
    for r in rows:
        if r['split']=='val' or r.get('cohort')=='fresh':
            d=float(distance(np.array([float(r['latitude']),float(r['longitude'])]),gps).min())
            if d<25 or r['id'] in ids or r['sequence'] in sequences:
                removed.append({'id':r['id'],'split':r['split'],'minimum_old_training_km':d});continue
            minimum=min(minimum,d)
        kept.append(r)
    report={'manifest_before':manifest_fingerprint(rows),'manifest_after':manifest_fingerprint(kept),'removed':removed,'minimum_baseline_holdout_km':minimum,'policy':'discard val/fresh-test within 25 km or same sequence/ID as V1 training; before model selection'}
    atomic_json(kept,root/'manifest.json');atomic_json(report,root/'baseline-holdout-isolation.json')
    summary=json.loads((root/'data-summary.json').read_text());summary['original_planned_splits']=summary['splits'];summary['splits']={s:sum(r['split']==s for r in kept) for s in ['train','val','test']};summary['fresh_test']=sum(r.get('cohort')=='fresh' for r in kept);summary['manifest_sha256']=report['manifest_after'];summary['sequences']=len({r['sequence'] for r in kept});summary['countries']={c:sum(r['country']==c for r in kept) for c in sorted({r['country'] for r in kept})};atomic_json(summary,root/'data-summary.json')
    print(json.dumps({'removed':len(removed),'splits':summary['splits'],'fresh_test':summary['fresh_test'],'minimum_km':minimum}),flush=True)
if __name__=='__main__':main()
