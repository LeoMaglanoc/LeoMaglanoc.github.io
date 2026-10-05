"""Restore a complete experiment and rebind only filesystem paths in its checkpoints."""
import argparse,json,hashlib,shutil,subprocess,sys,zipfile
from pathlib import Path
import torch
from train import atomic_save

def main():
    p=argparse.ArgumentParser();p.add_argument('--bundle',type=Path,required=True);p.add_argument('--run-root',type=Path,required=True);args=p.parse_args()
    source=args.bundle;dest=args.run_root;bundle=json.loads((source/'bundle.json').read_text())
    for name,sha in bundle['sha256'].items():
        if hashlib.sha256((source/name).read_bytes()).hexdigest()!=sha:raise ValueError(f'Bundle checksum mismatch {name}')
    if dest.exists():raise ValueError('Restore destination already exists: choose a new path')
    dest.mkdir(parents=True)
    for name in ['manifest.json','image-sha256.json','dataset-revision.json']:shutil.copy2(source/name,dest/name)
    subprocess.run([sys.executable,'training/restore_data.py','--manifest',str(dest/'manifest.json'),'--shards','3'],check=True)
    for name in ['teacher-cache','validation-teacher']:
        if (source/(name+'.zip')).exists():
            with zipfile.ZipFile(source/(name+'.zip')) as archive:
                for member in archive.namelist():
                    target=(dest/member).resolve()
                    if not target.is_relative_to(dest.resolve()):raise ValueError('Unsafe cache archive path')
                archive.extractall(dest)
    for name in ['supervised','distilled']:
        shutil.copytree(source/name,dest/name)
        shutil.copy2(dest/'manifest.json',dest/name/'manifest.json')
        for checkpoint in ['best.pt','last.pt']:
            path=dest/name/checkpoint;state=torch.load(path,weights_only=False)
            state['arguments']['run_dir']=str(dest/name);state['arguments']['manifest']=str(dest/'manifest.json');state['arguments']['prefix_cache']=str(dest/'prefix.npy')
            if state['arguments'].get('teacher_cache'):state['arguments']['teacher_cache']=str(dest/'teacher-cache')
            atomic_save(state,path)
    print('Restored. Resume with the SAME objective weights and stage documented in the checkpoint arguments.',flush=True)
if __name__=='__main__':main()
