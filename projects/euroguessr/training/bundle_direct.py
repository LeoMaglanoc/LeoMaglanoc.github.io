"""Preserve direct GeoCLIP evaluation and reproducible export provenance."""
import argparse,json,hashlib,shutil,zipfile
from pathlib import Path
from train import ROOT
from teacher_common import atomic_json

def main():
    p=argparse.ArgumentParser();p.add_argument('--run-dir',type=Path,default=ROOT/'artifacts/geoclip-direct');p.add_argument('--destination',type=Path,default=ROOT/'checkpoints/geoclip-direct');args=p.parse_args()
    if args.destination.exists():raise ValueError('Direct bundle exists; preserve it and choose a new destination')
    args.destination.mkdir(parents=True)
    for name in ['validation-report.json','sanity-validation.json','test-report.json','quantization-comparison.json']:
        shutil.copy2(args.run_dir/name,args.destination/name)
    shutil.copy2(args.run_dir/'models/metadata.json',args.destination/'metadata.json')
    # Preserve rejected backend measurements alongside the selected predictor.
    evidence=args.destination/'backend-evidence';evidence.mkdir()
    for name in ['geoclip-exact-input-parity.json','geoclip-u8-float-patch-parity.json','geoclip-weight-only-parity.json','geoclip-sealed-source-parity.json']:
        source=ROOT/'docs'/name
        if source.exists():shutil.copy2(source,evidence/name)
    for source in sorted((ROOT/'docs').glob('chrome-v2-final-*.json')):shutil.copy2(source,evidence/source.name)
    with zipfile.ZipFile(evidence/'actual-chrome-audits.zip','w',compression=zipfile.ZIP_DEFLATED) as archive:
        for source in sorted((ROOT/'artifacts/geoclip-direct').glob('browser-backend-audit*.json')):archive.write(source,source.name)
    sources=args.destination/'sources';sources.mkdir()
    for source in [*(ROOT/'training').glob('*.py'),*(ROOT/'tests').glob('runtime*'),ROOT/'src/clip-preprocess.js',ROOT/'src/inference.worker.js',ROOT/'src/geo.js',ROOT/'Dockerfile',ROOT/'training/research-lock.txt']:
        destination=sources/source.relative_to(ROOT);destination.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(source,destination)
    meta=json.loads((args.destination/'metadata.json').read_text())
    atomic_json({'format_version':1,'files_sha256':{str(p.relative_to(args.destination)):hashlib.sha256(p.read_bytes()).hexdigest() for p in args.destination.rglob('*') if p.is_file()},'runtime_sha256':meta['runtime_sha256'],'runtime_directory':'projects/euroguessr/models/geoclip','source_sha256':{n:hashlib.sha256((ROOT/'training'/n).read_bytes()).hexdigest() for n in ['export_geoclip_direct.py','evaluate_geoclip_direct.py','teacher_common.py','fingerprint_runtime.py']},'continuation':'Pretrained image-only weights are preserved in the Git runtime directory; re-export with the pinned Docker exporter for a new quantization or gallery experiment. No GeoCLIP training was performed. Use a new final test cohort for future model selection.'},args.destination/'bundle.json')
    print('Saved direct GeoCLIP bundle',args.destination,flush=True)
if __name__=='__main__':main()
