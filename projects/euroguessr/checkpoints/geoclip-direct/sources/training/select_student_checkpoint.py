"""Select head-best versus last checkpoint by deployed validation retrieval.

Training checkpoints remain intact. Both controls receive the same comparison;
the fresh test must still be unopened. This avoids choosing a CNN solely by a
classification head when the deployed predictor actually uses retrieval.
"""
import argparse,json,shutil
from pathlib import Path
from evaluate_student import finalize
from fingerprint_runtime import seal
from teacher_common import atomic_json

def main():
    p=argparse.ArgumentParser();p.add_argument('--run-dir',type=Path,required=True);p.add_argument('--audit-teacher',type=Path);args=p.parse_args();out=args.run_dir
    if (out/'test-report.json').exists() or (out.parent/'deployment-selection.json').exists():raise ValueError('Checkpoint selection must precede the locked deployment and fresh test')
    decision=out/'checkpoint-selection.json'
    if decision.exists():raise ValueError('Checkpoint comparison already saved; preserve it')
    candidates={}
    for checkpoint in ['best','last']:
        directory=out/f'{checkpoint}-evaluation'
        if directory.exists():raise ValueError('Evaluation directory exists; preserve previous measurements')
        meta=finalize(out,audit_teacher=args.audit_teacher,checkpoint=checkpoint,export_dir=directory)
        candidates[checkpoint]={'epoch':meta['best_epoch'],'method':meta['method'],'validation':meta['candidates'][meta['method']]['val'],'model_sha256':meta['model_sha256']}
    winner=min(candidates,key=lambda name:candidates[name]['validation']['median_km'])
    source=out/f'{winner}-evaluation'
    (out/'models').mkdir(exist_ok=True)
    for name in ['metrics.json','selection.json','evaluation-features.npz']:shutil.copy2(source/name,out/name)
    for path in (source/'models').iterdir():shutil.copy2(path,out/'models'/path.name)
    meta=seal(out/'models');atomic_json(meta,out/'metrics.json')
    atomic_json({'selected_checkpoint':winner+'.pt','criterion':'Minimum shared-validation median of the deployed inference method; head-best and last checkpoints compared symmetrically for A and B','candidates':candidates},decision)
    print('Validation-selected checkpoint',winner,flush=True)

if __name__=='__main__':main()
