"""Real CPU training verifies numerical resume, exact RNG and deadline export."""
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
    model_error=max(float((v-resumed['model'][k]).abs().max()) for k,v in full['model'].items())
    assert model_error<1e-7,'Resume model differs beyond CPU rounding tolerance'
    assert torch.equal(full['torch_rng'],resumed['torch_rng']),'Resume RNG differs'
    assert full['python_rng']==resumed['python_rng'] and np.array_equal(full['numpy_rng'][1],resumed['numpy_rng'][1]),'Resume Python/NumPy RNG differs'
    assert full['optimizer']['param_groups']==resumed['optimizer']['param_groups'],'Resume optimizer settings differ'
    optimizer_error=0.
    for key,state in full['optimizer']['state'].items():
        for name,value in state.items():
            other=resumed['optimizer']['state'][key][name]
            if torch.is_tensor(value):optimizer_error=max(optimizer_error,float((value-other).abs().max()))
            else:assert value==other
    assert optimizer_error<1e-7,'Resume optimizer differs beyond CPU rounding tolerance'
    assert all(abs(a['loss']-b['loss'])<1e-7 and a['val']==b['val'] for a,b in zip(full['history'],resumed['history'])),'Resume training trajectory differs'
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
    from evaluate_student import finalize
    exported=out/'spatial/last-evaluation'
    metadata=finalize(out/'spatial',checkpoint='last',export_dir=exported)
    assert metadata['selected_checkpoint']=='last.pt' and metadata['best_epoch']==spatial['epoch']
    model=Student(len(spatial['centers']),2);model.load_state_dict(spatial['model']);model.eval()
    refs=json.loads((exported/'models/references.json').read_text());matrix=np.fromfile(exported/'models/references.f32',dtype='<f4').reshape(refs['count'],refs['dimensions'])
    with torch.inference_mode():native=torch.nn.functional.normalize(model.encoder(tensor(DATA/'images'/f"{refs['ids'][0]}.jpg").unsqueeze(0)),dim=1).numpy()[0]
    assert np.allclose(matrix[0],native,atol=1e-5),'Last-checkpoint comparison used the wrong prefix/model'
    print(json.dumps({'numerical_model_and_optimizer_resume':'passed','resume_max_weight_error':model_error,'resume_max_optimizer_error':optimizer_error,'exact_rng_resume':'passed','deadline_checkpoint_and_export':'passed','deadline_resume':'passed','spatial_tail_transition_and_reference_parity':'passed','last_checkpoint_export_parity':'passed'}))
if __name__=='__main__':main()
