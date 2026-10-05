"""Real CPU training verifies exact resume and past-deadline ONNX finalization."""
import sys,json,subprocess,shutil
from pathlib import Path
import torch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'training'))
from train import ROOT
from teacher_common import atomic_json

def main():
    out=ROOT/'artifacts/contract-tests'
    if out.exists():shutil.rmtree(out) # Explicitly generated disposable test directory only.
    out.mkdir()
    state=torch.load(ROOT/'checkpoints/current/best.pt',weights_only=False)
    rows=json.loads((ROOT/'checkpoints/current/manifest.json').read_text());wanted=set(sum([state[s+'_ids'][:12] for s in ['train','val','test']],[]))
    rows=[r for r in rows if r['id'] in wanted];manifest=out/'manifest.json';atomic_json(rows,manifest)
    base=[sys.executable,'training/student_train.py','--manifest',str(manifest),'--cells','4','--threads','2','--patience','20']
    def run(name,*args):subprocess.run(base+['--run-dir',str(out/name),*args],cwd=ROOT,check=True,stdout=subprocess.DEVNULL)
    run('full','--epochs','2')
    run('resumed','--epochs','1');run('resumed','--epochs','1','--resume')
    full=torch.load(out/'full/last.pt',weights_only=False);resumed=torch.load(out/'resumed/last.pt',weights_only=False)
    assert full['epoch']==resumed['epoch']==1
    assert all(torch.equal(v,resumed['model'][k]) for k,v in full['model'].items()),'Resume model differs'
    assert torch.equal(full['torch_rng'],resumed['torch_rng']),'Resume RNG differs'
    run('deadline','--epochs','1','--stop-at','1970-01-01T00:00:00+00:00','--export')
    completion=json.loads((out/'deadline/completion.json').read_text());assert completion['reason']=='deadline'
    assert (out/'deadline/models/model.onnx').exists(),'Deadline skipped finalization'
    assert (out/'deadline/best.pt').exists() and (out/'deadline/last.pt').exists()
    run('deadline','--epochs','1','--resume','--export')
    assert torch.load(out/'deadline/last.pt',weights_only=False)['epoch']==0
    print(json.dumps({'exact_resume':'passed','deadline_checkpoint_and_export':'passed','deadline_resume':'passed'}))
if __name__=='__main__':main()
