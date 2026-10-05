"""Lock a validation-only deployment decision before opening any fresh test results."""
import argparse,json
from pathlib import Path
from datetime import datetime,timezone
from train import ROOT
from teacher_common import atomic_json

def main():
    p=argparse.ArgumentParser();p.add_argument('--run-root',type=Path,default=ROOT/'artifacts/geoclip-overnight');p.add_argument('--direct-run',type=Path,default=ROOT/'artifacts/geoclip-direct');p.add_argument('--minimum-improvement',type=float,default=.02);args=p.parse_args()
    root=args.run_root;path=root/'deployment-selection.json'
    if not 0<=args.minimum_improvement<1:raise ValueError('Invalid promotion threshold')
    if path.exists():raise ValueError('Deployment decision already locked; preserve it')
    if any(p.exists() for p in [root/'baseline-test.json',root/'supervised/test-report.json',root/'distilled/test-report.json',args.direct_run/'test-report.json']):raise ValueError('Fresh test already inspected; lock a new experiment before testing')
    baseline=json.loads((root/'baseline-comparison.json').read_text());candidates={}
    for name,directory in [('supervised',root/'supervised/models'),('distilled',root/'distilled/models'),('geoclip',args.direct_run/'models')]:
        meta=json.loads((directory/'metadata.json').read_text());manifest=meta.get('manifest_sha256',meta.get('validation_selection',{}).get('manifest_sha256'))
        if manifest!=baseline['manifest_sha256']:raise ValueError('Candidate validation manifest mismatch')
        if not meta.get('prediction_sha256'):raise ValueError('Seal candidate runtime identity before selection')
        val=meta['candidates'][meta['method']]['val']
        if val['n']!=baseline['validation']['n']:raise ValueError('Candidate validation cohort size mismatch')
        candidates[name]={'version':meta['version'],'method':meta['method'],'prediction_sha256':meta['prediction_sha256'],'validation':val}
    winner=min(['supervised','distilled'],key=lambda name:candidates[name]['validation']['median_km'])
    qualifies=candidates[winner]['validation']['median_km']<=baseline['validation']['median_km']*(1-args.minimum_improvement)
    atomic_json({'created_at':datetime.now(timezone.utc).isoformat(),'tiny':winner if qualifies else 'v1','optional':'geoclip','minimum_validation_improvement':args.minimum_improvement,'manifest_sha256':baseline['manifest_sha256'],'baseline':baseline['validation'],'candidates':candidates,'selection':'Shared validation median only; fresh test remains unopened'},path)
    print('Locked Tiny:',winner if qualifies else 'preserved V1',flush=True)
if __name__=='__main__':main()
