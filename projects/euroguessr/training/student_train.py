"""CPU MobileNet/GeoCLIP student, frozen-prefix caching and resumable training.
All exports stay inside the run directory. Promotion is a separate validation gate.
"""
import argparse, hashlib, json, random, signal, time
from datetime import datetime
from pathlib import Path
import numpy as np
import torch
from torch import nn
from train import ROOT, DATA, Model, cells, distance, tensor, atomic_save, metrics, nearest
from teacher_common import fingerprint, manifest_fingerprint, atomic_json
from cache_teacher import load_cache
stop=False

def interrupt(*_):
    global stop
    stop=True

class Student(Model):
    def __init__(self,n):
        super().__init__(n)
        self.projection=nn.Linear(576,512)
    def project(self,z):return nn.functional.normalize(self.projection(z),dim=1)
    def forward(self,x):
        z=self.encoder(x)
        return z,self.head(z),self.project(z)
    def from_prefix(self,x):
        return self.encoder[2](self.encoder[1](self.encoder[0][-1](x)))

def loss_terms(logits,z,labels,weights,teacher_prob,teacher_z,mask,temperature,geo_weight,kd_weight,embed_weight):
    geo=nn.functional.cross_entropy(logits,labels,weight=weights,label_smoothing=.1)
    kd=logits.sum()*0;embed=z.sum()*0
    if mask.any():
        kd=nn.functional.kl_div(nn.functional.log_softmax(logits[mask]/temperature,dim=1),teacher_prob[mask],reduction='batchmean')*temperature**2
        embed=(1-(z[mask]*teacher_z[mask]).sum(1)).mean()
    total=geo_weight*geo+kd_weight*kd+embed_weight*embed
    return total,geo,kd,embed

def prefix_identity(model,rows):
    h=hashlib.sha256()
    for k,v in model.encoder[0][:-1].state_dict().items():
        h.update(k.encode());h.update(v.cpu().numpy().tobytes())
    return fingerprint({'manifest':manifest_fingerprint(rows),'prefix_weights':h.hexdigest(),'preprocess':'half-pixel-224-rgb-v1'})

def cached_prefix(model,rows,path):
    model.eval()
    identity=prefix_identity(model,rows)
    meta_path=path.with_suffix('.json')
    if path.exists() and meta_path.exists():
        meta=json.loads(meta_path.read_text())
        if meta['identity']!=identity:raise ValueError('Frozen prefix cache changed: use a new cache path')
        if meta['sha256']!=hashlib.sha256(path.read_bytes()).hexdigest():raise ValueError('Frozen prefix cache corrupted')
        return np.load(path,mmap_mode='r')
    path.parent.mkdir(parents=True,exist_ok=True);tmp=path.with_suffix('.tmp.npy')
    model.eval()
    with torch.inference_mode():
        for start in range(0,len(rows),32):
            x=torch.stack([tensor(DATA/'images'/f"{r['id']}.jpg") for r in rows[start:start+32]])
            f=model.encoder[0][:-1](x).numpy()
            if start==0:store=np.lib.format.open_memmap(tmp,mode='w+',dtype='float32',shape=(len(rows),*f.shape[1:]))
            store[start:start+len(f)]=f
            print('prefix',start+len(f),'/',len(rows),flush=True)
        store.flush();del store
    tmp.replace(path)
    atomic_json({'identity':identity,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()},meta_path)
    return np.load(path,mmap_mode='r')

def all_features(model,prefix,indices):
    model.eval()
    with torch.inference_mode():
        return torch.cat([model.from_prefix(torch.from_numpy(np.array(prefix[indices[s:s+64]]))) for s in range(0,len(indices),64)])

def warm_start(model,state):
    # New grid/projection: preserve compatible encoder only, never old cells/head.
    compatible={k:v for k,v in state['model'].items() if k.startswith('encoder.') and k in model.state_dict() and v.shape==model.state_dict()[k].shape}
    if not compatible:raise ValueError('Warm start has no compatible encoder weights')
    model.load_state_dict(compatible,strict=False)
    return len(compatible)

def deadline_reached(stop_at):return stop_at is not None and time.time()>=stop_at

def main():
    global stop
    p=argparse.ArgumentParser()
    p.add_argument('--manifest',type=Path,required=True);p.add_argument('--run-dir',type=Path,required=True)
    p.add_argument('--cells',type=int,default=96);p.add_argument('--cell-definition',type=Path)
    p.add_argument('--epochs',type=int,default=50);p.add_argument('--patience',type=int,default=15)
    p.add_argument('--threads',type=int,default=2);p.add_argument('--seed',type=int,default=42)
    p.add_argument('--warm-start',type=Path);p.add_argument('--resume',action='store_true');p.add_argument('--finetune',action='store_true')
    p.add_argument('--teacher-cache',type=Path);p.add_argument('--geo-weight',type=float,default=.5);p.add_argument('--kd-weight',type=float,default=.2);p.add_argument('--embed-weight',type=float,default=.3)
    p.add_argument('--learning-rate',type=float);p.add_argument('--prefix-cache',type=Path)
    p.add_argument('--stop-at');p.add_argument('--export',action='store_true',help='Validation selection + private ONNX; no public mutation')
    args=p.parse_args()
    if args.epochs<1 or args.patience<1 or min(args.geo_weight,args.kd_weight,args.embed_weight)<0 or args.geo_weight<=0:raise ValueError('Invalid training settings')
    deadline=None
    if args.stop_at:
        dt=datetime.fromisoformat(args.stop_at)
        if dt.tzinfo is None:raise ValueError('Deadline must have a timezone')
        deadline=dt.timestamp()
    torch.set_num_threads(args.threads);torch.manual_seed(args.seed);np.random.seed(args.seed);random.seed(args.seed)
    signal.signal(signal.SIGINT,interrupt);signal.signal(signal.SIGTERM,interrupt)
    out=args.run_dir;out.mkdir(parents=True,exist_ok=True)
    rows=json.loads(args.manifest.read_text())
    if any(not (DATA/'images'/f"{r['id']}.jpg").exists() for r in rows):raise ValueError('Missing manifest images: restore/download first')
    gps=np.array([[float(r['latitude']),float(r['longitude'])] for r in rows])
    tr=np.array([i for i,r in enumerate(rows) if r['split']=='train']);va=np.array([i for i,r in enumerate(rows) if r['split']=='val'])
    if min(len(tr),len(va))<10:raise ValueError('Insufficient training/validation data')
    held=np.array([i for i,r in enumerate(rows) if r['split'] in ['val','test']])
    for s in range(0,len(tr),256):
        if distance(gps[tr[s:s+256],None],gps[held][None]).min()<25:raise ValueError('Spatial leakage: sampler must exclude train/holdout neighbors')
    sets={k:{r['id'] for r in rows if r['split']==k} for k in ['train','val','test']}
    seq={k:{r['sequence'] for r in rows if r['split']==k} for k in sets}
    if len(set(r['id'] for r in rows))!=len(rows) or any(seq[a]&seq[b] for a,b in [('train','val'),('train','test'),('val','test')]):raise ValueError('ID/sequence leakage')
    mf=manifest_fingerprint(rows)
    resume=torch.load(out/'last.pt',weights_only=False) if args.resume else None
    if resume and resume['manifest_sha256']!=mf:raise ValueError('Resume manifest changed')
    if resume and args.warm_start:raise ValueError('Use resume OR warm start')
    if resume:centers=np.asarray(resume['centers'])
    elif args.cell_definition:
        raw=json.loads(args.cell_definition.read_text());centers=np.asarray(raw['centers'] if isinstance(raw,dict) else raw)
        if isinstance(raw,dict) and raw.get('training_ids_sha256')!=fingerprint(sorted(sets['train'])):raise ValueError('Cell definition training IDs mismatch')
    else:centers=cells(gps[tr],min(args.cells,len(tr)),args.seed)
    if centers.ndim!=2 or centers.shape[1]!=2 or not np.isfinite(centers).all():raise ValueError('Invalid centers')
    atomic_json({'centers':centers.tolist(),'training_ids_sha256':fingerprint(sorted(sets['train']))},out/'cells.json')
    model=Student(len(centers));teacher_hash=None;teacher_meta=None;targets={};temperature=2.
    if args.teacher_cache:
        teacher_meta,targets=load_cache(args.teacher_cache,rows,centers)
        teacher_hash=fingerprint(teacher_meta);temperature=teacher_meta['identity']['temperature']
        if not targets:raise ValueError('Empty training teacher cache')
    config={'geo_weight':args.geo_weight if targets else 1.,'kd_weight':args.kd_weight if targets else 0.,'embed_weight':args.embed_weight if targets else 0.,'teacher_hash':teacher_hash,'seed':args.seed,'cells_sha256':fingerprint(centers.tolist())}
    if resume:
        if resume['config']!=config:raise ValueError('Resume objective/cache/grid configuration changed')
        stage_state = torch.load(out/'best.pt',weights_only=False) if args.finetune and not resume['finetune'] else resume
        model.load_state_dict(stage_state['model'])
    elif args.warm_start:print('Warm-start encoder tensors',warm_start(model,torch.load(args.warm_start,weights_only=False)),flush=True)
    atomic_json(rows,out/'manifest.json')
    for param in model.encoder.parameters():param.requires_grad=False
    if args.finetune:
        for param in model.encoder[0][-1].parameters():param.requires_grad=True
    optimizer=torch.optim.AdamW([v for v in model.parameters() if v.requires_grad],lr=args.learning_rate or (1e-4 if args.finetune else 1e-3),weight_decay=.01)
    same_stage=resume and resume['finetune']==args.finetune
    if same_stage:
        optimizer.load_state_dict(resume['optimizer'])
        torch.set_rng_state(resume['torch_rng']);np.random.set_state(resume['numpy_rng']);random.setstate(resume['python_rng'])
    prefix=cached_prefix(model,rows,args.prefix_cache or out/'prefix.npy')
    all_ids=np.arange(len(rows));features=all_features(model,prefix,all_ids) if not args.finetune else None
    labels=torch.from_numpy(distance(gps[:,None],centers[None]).argmin(1))
    counts=np.bincount(labels[tr],minlength=len(centers));weights=torch.tensor(1/np.sqrt(np.maximum(counts,1)),dtype=torch.float32);weights/=weights.mean()
    teacher_z=torch.zeros(len(rows),512);teacher_prob=torch.zeros(len(rows),len(centers));coverage=torch.zeros(len(rows),dtype=torch.bool)
    for i,r in enumerate(rows):
        if r['id'] in targets:
            a,b=targets[r['id']];teacher_z[i]=torch.from_numpy(a);teacher_prob[i]=torch.from_numpy(b);coverage[i]=True
    best=resume['best_val_km'] if resume else float('inf');history=list(resume['history']) if resume else []
    epoch_start=resume['epoch']+1 if resume else 0;stale=resume.get('stale_epochs',0) if same_stage else 0
    started=time.monotonic()
    def save_state(epoch,improved):
        state={'format_version':2,'model':model.state_dict(),'optimizer':optimizer.state_dict(),'epoch':epoch,'finetune':args.finetune,'best_val_km':best,'stale_epochs':stale,'centers':centers,'manifest_sha256':mf,'teacher_cache_sha256':teacher_hash,'config':config,'torch_rng':torch.get_rng_state(),'numpy_rng':np.random.get_state(),'python_rng':random.getstate(),'history':history,'train_ids':[rows[i]['id'] for i in tr],'val_ids':[rows[i]['id'] for i in va],'test_ids':[r['id'] for r in rows if r['split']=='test'],'arguments':{k:str(v) if isinstance(v,Path) else v for k,v in vars(args).items()},'environment':{'torch':torch.__version__,'numpy':np.__version__},'source_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}
        atomic_save(state,out/'last.pt')
        if improved:atomic_save(state,out/'best.pt')
    # Ensure even an already-expired deadline leaves a resumable and exportable model.
    if not resume:
        model.eval();vf=features[va] if features is not None else all_features(model,prefix,va)
        with torch.no_grad():initial=metrics(centers[model.head(vf).argmax(1).numpy()],gps[va])
        best=initial['median_km'];save_state(-1,True)
    for epoch in range(epoch_start,epoch_start+args.epochs):
        if stop or deadline_reached(deadline):break
        model.eval();model.head.train();model.projection.train();sums=[]
        for ids in torch.randperm(len(tr)).split(128 if not args.finetune else 64):
            indices=tr[ids.numpy()];optimizer.zero_grad()
            native=features[indices] if features is not None else model.from_prefix(torch.from_numpy(np.array(prefix[indices])))
            logits=model.head(native);z=model.project(native)
            terms=loss_terms(logits,z,labels[indices],weights,teacher_prob[indices],teacher_z[indices],coverage[indices],temperature,config['geo_weight'],config['kd_weight'],config['embed_weight'])
            terms[0].backward();optimizer.step();sums.append([v.item() for v in terms])
        model.eval();vf=features[va] if features is not None else all_features(model,prefix,va)
        with torch.no_grad():val=metrics(centers[model.head(vf).argmax(1).numpy()],gps[va])
        improved=val['median_km']<best
        if improved:best=val['median_km'];stale=0
        else:stale+=1
        means=np.mean(sums,axis=0)
        entry={'epoch':epoch,'stage':'final-block' if args.finetune else 'frozen','loss':float(means[0]),'supervised_loss':float(means[1]),'kd_loss':float(means[2]),'embedding_loss':float(means[3]),'val':val,'elapsed_seconds':time.monotonic()-started,'teacher_images':len(targets)}
        history.append(entry);save_state(epoch,improved);atomic_json(history,out/'history.json');print(json.dumps(entry),flush=True)
        if stale>=args.patience:print('Early stopping: validation head plateau',flush=True);break
    reason='signal' if stop else 'deadline' if deadline_reached(deadline) else 'plateau' if stale>=args.patience else 'epochs'
    atomic_json({'reason':reason,'training_seconds':time.monotonic()-started,'last_epoch':history[-1]['epoch'] if history else -1,'best_val_km':best,'teacher_images':len(targets)},out/'completion.json')
    if args.export:
        from evaluate_student import finalize
        finalize(out,prefix=prefix)
if __name__=='__main__':main()
