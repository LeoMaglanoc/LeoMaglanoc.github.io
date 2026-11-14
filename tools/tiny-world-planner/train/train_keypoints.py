"""Train an explicitly supervised keypoint variant without altering the release."""
import argparse,gzip,json,time,hashlib,copy
from pathlib import Path
import numpy as np
import torch
from torch import nn
from keypoint_models import ProjectedKeypointEncoder,KeypointEncoder,RigidKeypointDynamics,EquivariantKeypointDynamics,LinearDiagnostic
p=argparse.ArgumentParser();p.add_argument('--data',default='local-data');p.add_argument('--out',default='local-models-keypoints');p.add_argument('--encoder-steps',type=int,default=4500);p.add_argument('--dynamics-steps',type=int,default=6000);p.add_argument('--reuse-encoders',action='store_true');p.add_argument('--equivariant',action='store_true');p.add_argument('--results',default='results/keypoints-v3');p.add_argument('--initial-dynamics');p.add_argument('--projected',action='store_true');p.add_argument('--rest-preserving',action='store_true');p.add_argument('--validation-schedule',choices=['legacy','linear'],default='linear');a=p.parse_args()
torch.set_num_threads(4);torch.manual_seed(731);np.random.seed(731);start=time.time();root=Path(a.data);out=Path(a.out);out.mkdir(parents=True,exist_ok=True);results=Path(a.results);results.mkdir(parents=True,exist_ok=True);meta=json.loads((root/'metadata.json').read_text());E,T=meta['episodes'],meta['steps'];tr=int(E*.8);va=int(E*.9)
def load(n,dtype,shape):return np.frombuffer(gzip.decompress((root/f'{n}.bin.gz').read_bytes()),dtype=dtype).copy().reshape(shape)
images=load('images',np.uint8,(E*(T+1),2,64,64));labels=torch.from_numpy(load('states',np.float32,(E,T+1,9)));actions=torch.from_numpy(load('actions',np.float32,(E,T,2)));contact=load('contact',np.uint8,(E,T));flat=labels.reshape(-1,9)
local=torch.tensor([[-.9,-.725],[.9,-.725],[0,.85],[0,-.2]])/10
s,c=flat[:,2:3],flat[:,3:4];x=local[:,0]*c-local[:,1]*s+flat[:,0:1];y=local[:,0]*s+local[:,1]*c+flat[:,1:2];object_targets=torch.stack([x,y],-1);agent_targets=flat[:,4:6,None].transpose(1,2)
encoders=[];report={'seed':731,'arguments':vars(a),'dataset':meta,'supervision':'explicit image-to-keypoint auxiliary pose supervision, not purely self-supervised','encoders':[]}
def batch(indices,stream):return torch.from_numpy(images[indices,stream:stream+1].astype(np.float32)/255)
def embed(enc,stream,indices):
    with torch.no_grad():return torch.cat([enc(batch(indices[i:i+256],stream)) for i in range(0,len(indices),256)])
for stream,points,targets in [(0,4,object_targets),(1,1,agent_targets)]:
    enc=ProjectedKeypointEncoder(points) if a.projected and stream==0 else KeypointEncoder(points);opt=torch.optim.Adam(enc.parameters(),lr=.001);best=float('inf');checkpoint=None
    val=np.arange(tr*(T+1),va*(T+1),8)
    if a.reuse_encoders:
        checkpoint=torch.load(out/f'encoder{stream}.pt',weights_only=True);enc.load_state_dict(checkpoint)
        with torch.no_grad():v=torch.cat([enc.coordinates(batch(val[i:i+128],stream)) for i in range(0,len(val),128)]);best=(v-targets[val]).square().sum(-1).sqrt().mean().item()*10
    for step in range(0 if a.reuse_encoders else a.encoder_steps if stream==0 else a.encoder_steps//2):
        ix=np.random.randint(tr*(T+1),size=96);image=batch(ix,stream);maps=enc.maps(image);pred=torch.softmax(maps,-1)@enc.grid;target=targets[ix];distance=(enc.grid[None,None]-target[:,:,None]).square().sum(-1);heat=torch.softmax(-distance/(2*.018**2),-1);ce=-(heat*torch.log_softmax(maps,-1)).sum(-1).mean();coordinate=(pred-target).square().mean();loss=ce+coordinate*500;opt.zero_grad();loss.backward();opt.step()
        if step%250==0:
            with torch.no_grad():v=torch.cat([enc.coordinates(batch(val[i:i+128],stream)) for i in range(0,len(val),128)]);error=(v-targets[val]).square().sum(-1).sqrt().mean().item()*10
            print('encoder',stream,step,'loss',round(loss.item(),5),'validation keypoint error',round(error,5),flush=True)
            if error<best:best=error;checkpoint=copy.deepcopy(enc.state_dict())
    enc.load_state_dict(checkpoint);enc.eval();encoders.append(enc);report['encoders'].append({'stream':stream,'validationKeypointErrorWorldUnits':best});torch.save(enc.state_dict(),out/f'encoder{stream}.pt')
features=torch.cat([embed(enc,stream,np.arange(E*(T+1))) for stream,enc in enumerate(encoders)],-1).reshape(E,T+1,24);states=torch.cat([features,torch.cat([features[:,:1],features[:,:-1]],1)],-1)
decoder=LinearDiagnostic();x=torch.cat([features[:tr].reshape(-1,24),torch.ones(tr*(T+1),1)],-1);y=labels[:tr,:,:6].reshape(-1,6);xd,yd=x.double(),y.double();coef=torch.linalg.solve(xd.T@xd+torch.eye(25,dtype=torch.float64)*.001,xd.T@yd).float()
with torch.no_grad():decoder.linear.weight.copy_(coef[:24].T);decoder.linear.bias.copy_(coef[24])
decoder.eval();torch.manual_seed(733);np.random.seed(733);model=EquivariantKeypointDynamics(rest_preserving=a.rest_preserving) if a.equivariant else RigidKeypointDynamics();
if a.initial_dynamics:model.load_state_dict(torch.load(a.initial_dynamics,weights_only=True))
opt=torch.optim.Adam(model.parameters(),lr=.0007);best=float('inf');checkpoint=None;moving=np.argwhere(contact[:tr,:T-8])
def loss(e,t,h):
    state=states[e,t];total=0
    for k in range(h):state=model(state,actions[e,t+k]);total+=(state[:,:16]-features[e,t+k+1,:16]).square().mean()+.5*(state[:,16:24]-features[e,t+k+1,16:24]).square().mean()
    return total/h
for step in range(a.dynamics_steps):
    e=torch.randint(tr,(256,));t=torch.randint(T-8,(256,));h=1 if step<1000 else 3 if step<2500 else 5
    selected=moving[np.random.randint(len(moving),size=128)];e[:128]=torch.from_numpy(selected[:,0]);t[:128]=torch.from_numpy(selected[:,1]);value=loss(e,t,h);opt.zero_grad();value.backward();nn.utils.clip_grad_norm_(model.parameters(),5);opt.step()
    if step%250==0:
        with torch.no_grad():v=loss(torch.arange(tr,va).repeat_interleave(8),(torch.arange(8)*8 if a.validation_schedule=='legacy' else torch.linspace(0,T-6,8).long()).repeat(va-tr),5).item()
        print('dynamics',step,round(value.item(),6),round(v,6),flush=True)
        if v<best:best=v;checkpoint=copy.deepcopy(model.state_dict())
model.load_state_dict(checkpoint);model.eval();torch.save(model.state_dict(),out/'dynamics.pt');torch.save(decoder.state_dict(),out/'decoder.pt')
with torch.no_grad():
    pred=decoder(states[va:].reshape(-1,48));target=labels[va:,:,:6].reshape(-1,6);report['currentDecodedPositionErrorWorldUnits']=(pred[:,:2]-target[:,:2]).square().sum(-1).sqrt().mean().item()*10
metrics=[]
for h in [1,3,5,8,16]:
    e=torch.arange(va,E).repeat_interleave(T-h);t=torch.arange(T-h).repeat(E-va)
    with torch.no_grad():
        state=states[e,t]
        for k in range(h):state=model(state,actions[e,t+k])
        mse=(state[:,:24]-features[e,t+h]).square().mean(-1);static=(states[e,t,:24]-features[e,t+h]).square().mean(-1);decoded=decoder(state);target=labels[e,t+h,:6];angle=torch.atan2(decoded[:,2],decoded[:,3])-torch.atan2(target[:,2],target[:,3]);pos=(decoded[:,:2]-target[:,:2]).square().sum(-1).sqrt()*10
    metrics.append({'horizon':h,'latentMSE':mse.mean().item(),'staticMSE':static.mean().item(),'decodedPositionErrorWorldUnits':pos.mean().item(),'decodedAngleErrorRadians':torch.atan2(angle.sin(),angle.cos()).abs().mean().item()})
report['prediction']=metrics;report['elapsedSeconds']=time.time()-start
for name,module,inputs,names,outputs in [('object_encoder',encoders[0],(torch.zeros(1,1,64,64),),['image'],['latent']),('agent_encoder',encoders[1],(torch.zeros(1,1,64,64),),['image'],['latent']),('latent_dynamics',model,(torch.zeros(1,48),torch.zeros(1,2)),['state','action'],['next_state']),('diagnostic_decoder',decoder,(torch.zeros(1,48),),['state'],['pose'])]:
    torch.onnx.export(module,inputs,out/f'{name}.onnx',input_names=names,output_names=outputs,dynamic_axes={n:{0:'batch'} for n in names+outputs},opset_version=17)
metadata={'version':'v3-keypoint-development','status':'experimental','objectLatent':16,'agentLatent':8,'stateDim':48,'note':'Explicitly pose-supervised visual keypoints and a learned rigid latent transition. No simulator state inputs, numerical goal cost or diagnostic-decoder action selection.','architecture':'CNN spatial-softmax keypoints; rigid transform parameterized by learned MLP; learned pusher action matrix','models':{n:{'sha256':hashlib.sha256((out/f'{n}.onnx').read_bytes()).hexdigest(),'bytes':(out/f'{n}.onnx').stat().st_size} for n in ['object_encoder','agent_encoder','latent_dynamics','diagnostic_decoder']},'trainingReport':report}
(out/'model_metadata.json').write_text(json.dumps(metadata,indent=2));(results/'training.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2),flush=True)
