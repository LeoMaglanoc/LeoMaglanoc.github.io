"""Select cells on validation and size teacher subset using the measured budget."""
import argparse,json,time,shutil
from datetime import datetime
from pathlib import Path
import torch
from teacher_common import atomic_json
from train import ROOT

def main():
    p=argparse.ArgumentParser();p.add_argument('--run-root',type=Path,default=ROOT/'artifacts/geoclip-overnight');p.add_argument('--teacher-stop-at',default='2026-10-06T01:15:00+02:00');args=p.parse_args();root=args.run_root
    candidates={}
    for n in [64,96,128]:
        state=torch.load(root/f'grid-{n}'/'best.pt',weights_only=False)
        candidates[str(n)]={'validation_head_median_km':state['best_val_km'],'best_epoch':state['epoch']}
    best=min(candidates,key=lambda k:candidates[k]['validation_head_median_km'])
    shutil.copy2(root/f'grid-{best}'/'cells.json',root/'cells.json')
    atomic_json({'candidates':candidates,'selected_cells':int(best),'selection':'validation head median only'},root/'grid-search.json')
    benchmark=json.loads((root/'teacher-benchmark.json').read_text())
    if not benchmark.get('completed'):raise ValueError('Complete all benchmark batches first')
    measured=min(benchmark['results'],key=lambda r:r['seconds_per_image'])
    budget=max(0,datetime.fromisoformat(args.teacher_stop_at).timestamp()-time.time())
    available=sum(r['split']=='train' for r in json.loads((root/'manifest.json').read_text()))
    count=min(5000,available,int(budget*.85/measured['seconds_per_image']))
    if count<300:raise ValueError('Insufficient teacher budget; explicitly extend teacher deadline or reuse cached targets')
    atomic_json({'batch_size':measured['batch_size'],'seconds_per_image':measured['seconds_per_image'],'available_seconds':budget,'teacher_count':count,'teacher_stop_at':args.teacher_stop_at,'safety_fraction':.85,'selected_cells':int(best)},root/'teacher-budget.json')
    print('Selected grid',best,'teacher images',count,flush=True)
if __name__=='__main__':main()
