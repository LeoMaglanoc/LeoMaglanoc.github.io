"""Explicit promotion: comparable validation gate, test lock, backup, and runtime-only copy."""
import argparse,json,hashlib,shutil
from pathlib import Path
from train import ROOT
from teacher_common import atomic_json

def main():
    p=argparse.ArgumentParser();p.add_argument('--run-dir',type=Path,required=True);p.add_argument('--baseline-report',type=Path,required=True);p.add_argument('--minimum-improvement',type=float,default=.02);p.add_argument('--backup',type=Path,required=True);args=p.parse_args()
    meta=json.loads((args.run_dir/'models/metadata.json').read_text());baseline=json.loads(args.baseline_report.read_text())
    if meta['manifest_sha256']!=baseline['manifest_sha256']:raise ValueError('Promotion requires comparable validation manifest')
    candidate=meta['candidates'][meta['method']]['val']['median_km'];old=baseline['validation']['median_km']
    if candidate>old*(1-args.minimum_improvement):raise ValueError(f'Promotion rejected: {candidate:.1f} vs {old:.1f} km')
    if meta['test_status']!='locked fresh cohort evaluated once':raise ValueError('Run the final locked test evaluation before promotion')
    if args.backup.exists():raise ValueError('Choose a new backup directory; never overwrite backups')
    shutil.copytree(ROOT/'models',args.backup/'models');shutil.copy2(ROOT/'rounds.json',args.backup/'rounds.json')
    meta['checkpoint_bundle']=f'checkpoints/geoclip-v2/{args.run_dir.name}'
    atomic_json(meta,args.run_dir/'models/metadata.json')
    atomic_json(meta,args.run_dir/'metrics.json')
    for name in ['model.onnx','metadata.json','references.json','references.f32']:shutil.copy2(args.run_dir/'models'/name,ROOT/'models'/name)
    import onnxruntime as ort
    from train import tensor
    pack=json.loads((ROOT/'rounds.json').read_text());opts=ort.SessionOptions();opts.intra_op_num_threads=2
    sess=ort.InferenceSession(str(ROOT/'models/model.onnx'),sess_options=opts,providers=['CPUExecutionProvider']);out=sess.run(None,{'image':tensor(ROOT/pack[0]['image']).unsqueeze(0).numpy()})
    atomic_json({'image':pack[0]['image'],'embedding':out[0][0].tolist(),'logits':out[1][0].tolist(),'projection':out[2][0].tolist(),'expected_method':meta['method']},ROOT/'models/fixture.json')
    atomic_json({'run':str(args.run_dir),'validation_before':old,'validation_after':candidate,'improvement_fraction':1-candidate/old,'backup':str(args.backup),'model_sha256':hashlib.sha256((ROOT/'models/model.onnx').read_bytes()).hexdigest()},args.run_dir.parent/'promotion.json')
    print('Promoted',meta['version'],meta['method'],flush=True)
if __name__=='__main__':main()
