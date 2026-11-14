"""CPU-reproducible experiment; artifacts and every measured gate are recorded."""
import argparse,gzip,json,hashlib,time,copy,os,sys
from pathlib import Path
import numpy as np
import torch
from torch import nn
from models import Encoder,NormalizedEncoder,Dynamics,Decoder,vicreg

p=argparse.ArgumentParser();p.add_argument('--data',default='local-data');p.add_argument('--out',default='../../assets/interactive/tiny-world-planner/models');p.add_argument('--ssl-steps',type=int,default=500);p.add_argument('--pose-steps',type=int,default=8000);p.add_argument('--dynamics-steps',type=int,default=3500);args=p.parse_args()
torch.set_num_threads(4);torch.manual_seed(714);np.random.seed(714);started=time.time()
root=Path(args.data);meta=json.loads((root/'metadata.json').read_text());E,T=meta['episodes'],meta['steps'];train_end=int(E*.8);val_end=int(E*.9);out=Path(args.out);out.mkdir(parents=True,exist_ok=True);Path('checkpoints').mkdir(exist_ok=True);Path('results').mkdir(exist_ok=True)
def load(name,dtype,shape):return np.frombuffer(gzip.decompress((root/f'{name}.bin.gz').read_bytes()),dtype=dtype).reshape(shape).copy()
images=load('images',np.uint8,(E,T+1,2,64,64));labels=torch.from_numpy(load('states',np.float32,(E,T+1,9))[:,:,:6]);actions=torch.from_numpy(load('actions',np.float32,(E,T,2)));contact=load('contact',np.uint8,(E,T))
report={'seed':714,'torch':torch.__version__,'dataset':meta,'architecture':{'image':[1,64,64],'object':16,'agent':8,'state':48,'hidden':192},'experiments':[]}
def batch_img(indices,stream):return torch.from_numpy(images.reshape(-1,2,64,64)[indices,stream:stream+1].astype(np.float32)/255)
def embed(enc,stream,indices):
    with torch.no_grad():return torch.cat([enc(batch_img(indices[i:i+256],stream)) for i in range(0,len(indices),256)])
def probe(enc,stream):
    tr=np.random.RandomState(42).choice(train_end*(T+1),min(5000,train_end*(T+1)),replace=False);va=np.arange(train_end*(T+1),val_end*(T+1),4)
    x=embed(enc,stream,tr);v=embed(enc,stream,va);x=torch.cat([x,torch.ones(len(x),1)],1);v=torch.cat([v,torch.ones(len(v),1)],1);y=labels.reshape(-1,6)[:,0:4 if stream==0 else 6] if stream==0 else labels.reshape(-1,6)[:,4:6]
    coef=torch.linalg.solve(x.T@x+torch.eye(x.shape[1])*.01,x.T@y[tr]);pred=v@coef;target=y[va];err=(pred[:,:2]-target[:,:2]).square().sum(-1).sqrt().mean().item()*10
    angle=None
    if stream==0:angle=torch.atan2(torch.sin(torch.atan2(pred[:,2],pred[:,3])-torch.atan2(target[:,2],target[:,3])),torch.cos(torch.atan2(pred[:,2],pred[:,3])-torch.atan2(target[:,2],target[:,3]))).abs().mean().item()
    return {'position_mean_units':err,'orientation_mean_radians':angle,'feature_std_mean':float(x[:,:-1].std(0).mean())}

encoders=[];training_kind=[]
for stream,dim in [(0,16),(1,8)]:
    enc=Encoder(dim);optim=torch.optim.Adam(enc.parameters(),lr=.001);head=nn.Linear(dim,4 if stream==0 else 2)
    for step in range(args.ssl_steps):
        ix=np.random.randint(0,train_end*(T+1),128);im=batch_img(ix,stream);a=enc(im+torch.randn_like(im)*.015);b=enc(im+torch.randn_like(im)*.015);loss=vicreg(a,b);optim.zero_grad();loss.backward();optim.step()
        if step%200==0:print('ssl',stream,step,round(loss.item(),4),flush=True)
    ssl=probe(enc,stream);report['experiments'].append({'stage':'pure_vicreg','stream':stream,'probe':ssl});print('ssl gate',stream,ssl,flush=True)
    # Linear frozen-feature probe determines an explicitly disclosed auxiliary fallback.
    fallback=ssl['position_mean_units']>.35 or (stream==0 and ssl['orientation_mean_radians']>.3)
    if fallback:
        optim=torch.optim.Adam(list(enc.parameters())+list(head.parameters()),lr=.0007)
        for step in range(args.pose_steps):
            ix=np.random.randint(0,train_end*(T+1),128);im=batch_img(ix,stream);a=enc(im+torch.randn_like(im)*.01);target=labels.reshape(-1,6)[ix,:4] if stream==0 else labels.reshape(-1,6)[ix,4:6];pred=head(a);weights=torch.tensor([8.,8.,1.,1.] if stream==0 else [8.,8.]); supervised=((pred-target)*weights).square().mean(); perm=torch.randperm(len(a)); spatial=target.clone(); spatial[:,:2]*=5; desired=(spatial-spatial[perm]).square().sum(-1)/4; distance=(a-a[perm]).square().mean(-1); metric=(distance-desired).square().mean(); loss=20*supervised+2*metric+.0002*vicreg(a,enc(im+torch.randn_like(im)*.01));optim.zero_grad();loss.backward();optim.step()
            if step%300==0:print('auxiliary pose',stream,step,round(loss.item(),4),flush=True)
        report['experiments'].append({'stage':'auxiliary_pose_fallback','stream':stream,'probe':probe(enc,stream)})
    training_kind.append('vicreg+auxiliary_pose_and_metric' if fallback else 'vicreg')
    enc.eval();ix=np.arange(train_end*(T+1),step=4);features=embed(enc,stream,ix);encoders.append(NormalizedEncoder(enc,features.mean(0),features.std(0).clamp_min(.03)).eval())

allix=np.arange(E*(T+1));features=torch.cat([embed(enc,stream,allix) for stream,enc in enumerate(encoders)],-1).reshape(E,T+1,24)
previous=torch.cat([features[:,:1],features[:,:-1]],1);states=torch.cat([features,previous],-1)
model=Dynamics();optim=torch.optim.Adam(model.parameters(),lr=.0007);best=float('inf');best_state=None
def dynamics_loss(e,t,horizon):
    s=states[e,t];loss=0
    for k in range(horizon):s=model(s,actions[e,t+k]);loss=loss+(s[:,:24]-features[e,t+k+1]).square().mean()
    return loss/horizon
for step in range(args.dynamics_steps):
    e=torch.randint(0,train_end,(256,));t=torch.randint(0,T-5,(256,));horizon=1 if step<500 else (3 if step<1300 else 5)
    # Half of training batches oversample moving/contact transitions.
    if step%2==0:
        selected=np.argwhere(contact[:train_end,:T-5]);ix=np.random.randint(0,len(selected),128);e[:128]=torch.tensor(selected[ix,0]);t[:128]=torch.tensor(selected[ix,1])
    loss=dynamics_loss(e,t,horizon);optim.zero_grad();loss.backward();torch.nn.utils.clip_grad_norm_(model.parameters(),5);optim.step()
    if step%250==0 or step==args.dynamics_steps-1:
        with torch.no_grad():v=dynamics_loss(torch.arange(train_end,val_end).repeat_interleave(10),torch.arange(10).repeat(val_end-train_end)*5,5).item()
        print('dynamics',step,'train',round(loss.item(),5),'val5',round(v,5),flush=True)
        if v<best:best=v;best_state=copy.deepcopy(model.state_dict())
model.load_state_dict(best_state);model.eval();decoder=Decoder();opt=torch.optim.Adam(decoder.parameters(),lr=.001)
for step in range(1300):
    e=torch.randint(0,train_end,(256,));t=torch.randint(0,T+1,(256,));loss=(decoder(states[e,t])-labels[e,t]).square().mean();opt.zero_grad();loss.backward();opt.step()
decoder.eval()

prediction=[]
for horizon in [1,3,5,8]:
    e=torch.arange(val_end,E).repeat_interleave(T-horizon);t=torch.arange(T-horizon).repeat(E-val_end)
    with torch.no_grad():
        s=states[e,t];initial=s.clone()
        for k in range(horizon):s=model(s,actions[e,t+k])
        err=(s[:,:24]-features[e,t+horizon]).square().mean(-1);static=(initial[:,:24]-features[e,t+horizon]).square().mean(-1);decoded=decoder(s);target=labels[e,t+horizon];pos=(decoded[:,:2]-target[:,:2]).square().sum(-1).sqrt()*10;ang=torch.atan2(decoded[:,2],decoded[:,3])-torch.atan2(target[:,2],target[:,3]);ang=torch.atan2(ang.sin(),ang.cos()).abs();moving=torch.from_numpy(contact[e.numpy(),t.numpy()].astype(bool))
    prediction.append({'horizon':horizon,'latent_mse_mean':err.mean().item(),'latent_mse_std':err.std().item(),'constant_state_mse':static.mean().item(),'position_mean_units':pos.mean().item(),'orientation_mean_radians':ang.mean().item(),'contact_mse':err[moving].mean().item(),'noncontact_mse':err[~moving].mean().item()})
report['prediction']=prediction;report['representation_training']=training_kind
with torch.no_grad():
    sample=states[val_end:,:-1].reshape(-1,48)[:256];sensitivity=(model(sample,torch.ones(256,2))-model(sample,-torch.ones(256,2))).square().mean().item();report['action_sensitivity_mse']=sensitivity
for name,module,inputs,input_names,output_names in [('object_encoder',encoders[0],(torch.zeros(1,1,64,64),),['image'],['latent']),('agent_encoder',encoders[1],(torch.zeros(1,1,64,64),),['image'],['latent']),('latent_dynamics',model,(torch.zeros(1,48),torch.zeros(1,2)),['state','action'],['next_state']),('diagnostic_decoder',decoder,(torch.zeros(1,48),),['state'],['pose'])]:
    torch.onnx.export(module,inputs,str(out/f'{name}.onnx'),input_names=input_names,output_names=output_names,dynamic_axes={n:{0:'batch'} for n in input_names+output_names},opset_version=17)
    torch.save(module.state_dict(),f'checkpoints/{name}.pt')
    import onnxruntime as ort
    session=ort.InferenceSession(str(out/f'{name}.onnx'),providers=['CPUExecutionProvider']);parity=[]
    for batch in [1,64]:
        data=tuple(torch.randn(batch,*i.shape[1:]) for i in inputs)
        with torch.no_grad():expected=module(*data).numpy()
        actual=session.run(None,{n:i.numpy() for n,i in zip(input_names,data)})[0];error=float(np.max(np.abs(actual-expected)));assert error<1e-4,(name,batch,error);parity.append({'batch':batch,'max_absolute_error':error})
    report.setdefault('onnx_native_parity',{})[name]=parity
report['elapsed_seconds']=time.time()-started
metadata={'version':'tiny-world-planner-v2.1','status':'experimental','representation_training':training_kind,'objectLatent':16,'agentLatent':8,'stateDim':48,'stateOrder':'current object16, current agent8, previous object16, previous agent8','imageShape':['batch',1,64,64],'imageNormalization':'soft color masks in [0,1], quantized to 1/255 from 2x2 antialiased 64x64 RGBA pixels; no crop/translation','actionShape':['batch',2],'actionNormalization':'[-1,1]^2; relative displacement .48 workspace units in .1s','dynamicBatch':True,'opset':17,'dataset':meta,'trainingSeed':714,'trainingReport':'../../../../tools/tiny-world-planner/results/training.json','models':{n:{'sha256':hashlib.sha256((out/f'{n}.onnx').read_bytes()).hexdigest(),'bytes':(out/f'{n}.onnx').stat().st_size,'checkpointSha256':hashlib.sha256(Path(f'checkpoints/{n}.pt').read_bytes()).hexdigest()} for n in ['object_encoder','agent_encoder','latent_dynamics','diagnostic_decoder']},'metrics':prediction,'note':'Controlled-domain pixel masks. '+('Auxiliary pose and pairwise pose-metric supervision were required after frozen-feature probes; this is not purely self-supervised.' if any('auxiliary' in k for k in training_kind) else 'VICReg visual features; simulator poses supervise only the diagnostic decoder.')}
(out/'model_metadata.json').write_text(json.dumps(metadata,indent=2));Path('results/training.json').write_text(json.dumps(report,indent=2))
fixtures=[]
for index in [val_end*(T+1),val_end*(T+1)+17]:
    e,t=divmod(index,T+1);recurrent=states[e,t:t+1];rollout=[]
    with torch.no_grad():
        for k in range(5):recurrent=model(recurrent,torch.tensor([[.4,-.2]]));rollout.append(recurrent[0].tolist())
    fixtures.append({'object':(images[e,t,0].reshape(-1).astype(float)/255).tolist(),'agent':(images[e,t,1].reshape(-1).astype(float)/255).tolist(),'state':states[e,t].tolist(),'action':[.4,-.2],'expectedNext':rollout[0],'expectedRollout':rollout})
(out/'parity_fixtures.json').write_text(json.dumps(fixtures,separators=(',',':')));print(json.dumps(report['prediction'],indent=2));print('Finished in',report['elapsed_seconds'],flush=True)
