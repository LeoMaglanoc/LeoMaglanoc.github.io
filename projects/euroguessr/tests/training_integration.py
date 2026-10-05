"""Real CPU training verifies exact resume and past-deadline ONNX finalization."""
import sys,json,subprocess,shutil
from pathlib import Path
import torch
import numpy as np
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
    run('spatial','--epochs','1')
    initial=torch.load(out/'spatial/last.pt',weights_only=False)
    run('spatial','--epochs','1','--resume','--finetune','--tail-blocks','2','--prefix-cache',str(out/'prefix-tail2.npy'),'--export')
    spatial=torch.load(out/'spatial/last.pt',weights_only=False)
    assert spatial['config']['tail_blocks']==2
    from student_train import Student
    from train import tensor,DATA
    model=Student(len(spatial['centers']),2)
    prefix=f'encoder.0.{len(model.encoder[0])-2}.'
    assert any(not torch.equal(v,initial['model'][k]) for k,v in spatial['model'].items() if k.startswith(prefix) and v.is_floating_point()),'Spatial block was not trained'
    # Best may still be the frozen stage: export must use THAT stage's prefix.
    best=torch.load(out/'spatial/best.pt',weights_only=False)
    model=Student(len(best['centers']),best['config'].get('tail_blocks',1));model.load_state_dict(best['model']);model.eval()
    refs=json.loads((out/'spatial/models/references.json').read_text());matrix=np.fromfile(out/'spatial/models/references.f32',dtype='<f4').reshape(refs['count'],refs['dimensions'])
    with torch.inference_mode():native=model.encoder(tensor(DATA/'images'/f"{refs['ids'][0]}.jpg").unsqueeze(0));native=torch.nn.functional.normalize(native,dim=1).numpy()[0]
    assert np.allclose(matrix[0],native,atol=1e-5),'Reference export used the wrong frozen-prefix scope'
    print(json.dumps({'exact_resume':'passed','deadline_checkpoint_and_export':'passed','deadline_resume':'passed','spatial_tail_transition_and_reference_parity':'passed'}))
if __name__=='__main__':main()
