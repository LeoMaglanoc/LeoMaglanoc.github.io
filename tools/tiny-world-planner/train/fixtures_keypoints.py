"""Export real PyTorch fixtures for the final projected-keypoint variant."""
import gzip,json,sys
from pathlib import Path
import numpy as np
import torch
from keypoint_models import ProjectedKeypointEncoder,KeypointEncoder,EquivariantKeypointDynamics,LinearDiagnostic
torch.set_num_threads(4);root=Path('local-data-contact');out=Path(sys.argv[1] if len(sys.argv)>1 else 'local-models-keypoints-projected');meta=json.loads((root/'metadata.json').read_text());E,T=meta['episodes'],meta['steps'];images=np.frombuffer(gzip.decompress((root/'images.bin.gz').read_bytes()),dtype=np.uint8).reshape(E,T+1,2,64,64)
encoders=[ProjectedKeypointEncoder(4),KeypointEncoder(1)]
for stream,enc in enumerate(encoders):enc.load_state_dict(torch.load(out/f'encoder{stream}.pt',weights_only=True));enc.eval()
model=EquivariantKeypointDynamics(rest_preserving=True);model.load_state_dict(torch.load(out/'dynamics.pt',weights_only=True));model.eval();decoder=LinearDiagnostic();decoder.load_state_dict(torch.load(out/'decoder.pt',weights_only=True));decoder.eval();fixtures=[]
with torch.no_grad():
 for e,t in [(int(.9*E),0),(int(.9*E)+1,17)]:
  frames=[]
  for time in [t,max(0,t-1)]:frames.append(torch.cat([enc(torch.from_numpy(images[e,time,stream:stream+1,None].astype(np.float32)/255)) for stream,enc in enumerate(encoders)],-1))
  state=torch.cat(frames,-1);action=torch.tensor([[.4,-.2]]);initial=state[0].tolist();rollout=[]
  for k in range(5):state=model(state,action);rollout.append(state[0].tolist())
  fixtures.append({'object':(images[e,t,0].reshape(-1).astype(float)/255).tolist(),'agent':(images[e,t,1].reshape(-1).astype(float)/255).tolist(),'state':initial,'action':action[0].tolist(),'expectedNext':rollout[0],'expectedRollout':rollout})
(out/'parity_fixtures.json').write_text(json.dumps(fixtures,separators=(',',':')))
import onnxruntime as ort
reports={}
for name,module,inputs,names in [('object_encoder',encoders[0],(torch.rand(64,1,64,64),),['image']),('agent_encoder',encoders[1],(torch.rand(64,1,64,64),),['image']),('latent_dynamics',model,(torch.tensor([fixtures[0]['state']]*64),torch.rand(64,2)*2-1),['state','action']),('diagnostic_decoder',decoder,(torch.tensor([fixtures[0]['state']]*64),),['state'])]:
 session=ort.InferenceSession(str(out/f'{name}.onnx'),providers=['CPUExecutionProvider'])
 with torch.no_grad():expected=module(*inputs).numpy()
 actual=session.run(None,{n:x.numpy() for n,x in zip(names,inputs)})[0];error=float(np.max(np.abs(expected-actual)));assert error<1e-4,(name,error);reports[name]=error
Path('results/keypoints-v6/native-parity.json').write_text(json.dumps(reports,indent=2));print(reports)
