"""Tracked continuation bundle for all student controls and immutable teacher-cache archives."""
import argparse,json,hashlib,shutil,zipfile
from pathlib import Path
from teacher_common import atomic_json
from train import ROOT,DATA

def main():
    p=argparse.ArgumentParser();p.add_argument('--run-root',type=Path,default=ROOT/'artifacts/geoclip-overnight');p.add_argument('--destination',type=Path,default=ROOT/'checkpoints/geoclip-v2');args=p.parse_args()
    source=args.run_root;dest=args.destination
    if dest.exists():raise ValueError('Bundle exists; choose a new destination to preserve checkpoints')
    dest.mkdir(parents=True)
    runs=['supervised','distilled']+(['embedding-only'] if (source/'embedding-only').exists() else [])
    for run in runs:
        (dest/run).mkdir()
        # Preserve exact inference bytes for BOTH controls. Re-exporting from
        # identical weights can introduce tiny CPU rounding changes in galleries;
        # it must not silently replace the predictor used by the locked test.
        shutil.copytree(source/run/'models',dest/run/'models')
        for name in ['best.pt','last.pt','cells.json','history.json','completion.json','metrics.json','selection.json','checkpoint-selection.json','test-report.json']:
            if (source/run/name).exists():shutil.copy2(source/run/name,dest/run/name)
        for checkpoint in ['best','last']:
            directory=source/run/f'{checkpoint}-evaluation'
            if directory.exists():
                (dest/run/directory.name).mkdir()
                for name in ['metrics.json','selection.json']:shutil.copy2(directory/name,dest/run/directory.name/name)
    for name in ['manifest.json','data-summary.json','teacher-benchmark.json','teacher-budget.json','grid-search.json','baseline-comparison.json','baseline-test.json','deployment-selection.json','baseline-holdout-isolation.json','promotion.json','leakage-check.json','game-image-report.json','REPORT.md','docker-image-id.txt']:
        if (source/name).exists():shutil.copy2(source/name,dest/name)
    evidence=dest/'browser-evidence';evidence.mkdir()
    for path in sorted((ROOT/'docs').glob('chrome-v2-final-*.json')):shutil.copy2(path,evidence/path.name)
    rows=json.loads((source/'manifest.json').read_text())
    atomic_json({r['id']:hashlib.sha256((DATA/'images'/f"{r['id']}.jpg").read_bytes()).hexdigest() for r in rows},dest/'image-sha256.json')
    atomic_json({'repo':'osv5m/osv5m','revision':'cff33609b56b54d8743b7ee7a416eb8433e9a681','license':'cc-by-sa-4.0'},dest/'dataset-revision.json')
    for directory in ['teacher-cache','validation-teacher']:
        if not (source/directory).exists():continue
        with zipfile.ZipFile(dest/(directory+'.zip'),'w',compression=zipfile.ZIP_STORED) as archive:
            for path in sorted((source/directory).rglob('*')):
                if path.is_file() and not path.name.endswith('.tmp'):archive.write(path,path.relative_to(source).as_posix())
    files={p.relative_to(dest).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in dest.rglob('*') if p.is_file()}
    code={p.relative_to(ROOT).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in list((ROOT/'training').glob('*.py'))+[ROOT/'Dockerfile',ROOT/'requirements.txt',ROOT/'training/teacher-requirements.txt',ROOT/'training/research-lock.txt',ROOT/'training/geoclip_overnight.sh',ROOT/'training/embedding_only.sh',ROOT/'compose.yaml',ROOT/'nginx-preview.conf']}
    atomic_json({'format_version':2,'runs':runs,'sha256':files,'source_sha256':code,'runtime_source_sha256':{p.relative_to(ROOT).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in (ROOT/'src').glob('*.js')},'local_run_root':str(source),'includes':['both best and last student checkpoints','exact ONNX/gallery/runtime metadata for all selected student controls','optimizer and Python/NumPy/PyTorch RNG states','teacher embeddings/probabilities and atomic resume indexes','manifest and exact training image hashes','cell definitions, configuration, training histories, validation and locked test reports'],'restore':'docker compose run --rm research python training/restore_experiment.py --bundle checkpoints/geoclip-v2 --run-root artifacts/geoclip-overnight-restored'},dest/'bundle.json')
    print('Saved tracked continuation bundle',dest,flush=True)
if __name__=='__main__':main()
