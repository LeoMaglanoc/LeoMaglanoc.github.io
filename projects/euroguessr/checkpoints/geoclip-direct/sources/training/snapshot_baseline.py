"""Preserve the currently deployed tiny model before a new experiment."""
import argparse,json,shutil,hashlib
from pathlib import Path
from train import ROOT
from teacher_common import atomic_json

def main():
    p=argparse.ArgumentParser();p.add_argument('--run-root',type=Path,required=True);args=p.parse_args();dest=args.run_root/'baseline'
    if dest.exists():print('Preserved baseline already exists; never overwrite',flush=True);return
    dest.mkdir(parents=True);(dest/'models').mkdir()
    for path in (ROOT/'models').iterdir():
        if path.is_file():shutil.copy2(path,dest/'models'/path.name)
    shutil.copy2(ROOT/'rounds.json',dest/'rounds.json');shutil.copytree(ROOT/'images',dest/'images')
    meta=json.loads((ROOT/'models/metadata.json').read_text());checkpoint=ROOT/meta.get('checkpoint_bundle','checkpoints/current');manifest=checkpoint/'manifest.json'
    if not manifest.exists():manifest=checkpoint.parent/'manifest.json'
    shutil.copy2(manifest,dest/'training-manifest.json');shutil.copy2(checkpoint/'best.pt',dest/'best.pt')
    atomic_json({'metadata':meta,'files':{p.relative_to(dest).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in dest.rglob('*') if p.is_file()}},dest/'snapshot.json')
    print('Saved baseline',dest,flush=True)
if __name__=='__main__':main()
