"""Evaluate the released neural model and write measured metadata and plots."""
import gzip,json,sys,hashlib,platform
from pathlib import Path
import numpy as np
import torch
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'train'))
from keypoint_models import ProjectedKeypointEncoder,KeypointEncoder,EquivariantKeypointDynamics,LinearDiagnostic
torch.set_num_threads(4);root=Path('local-data-contact');checkpoint=Path('local-models-keypoints-projected');release=Path('../../assets/interactive/tiny-world-planner/models');results=Path('results');meta=json.loads((root/'metadata.json').read_text());E,T=meta['episodes'],meta['steps'];te=int(E*.9)
def load(n,dtype,shape):return np.frombuffer(gzip.decompress((root/f'{n}.bin.gz').read_bytes()),dtype=dtype).reshape(shape)
images=load('images',np.uint8,(E,T+1,2,64,64))[te:];labels=torch.from_numpy(load('states',np.float32,(E,T+1,9))[te:].copy());actions=torch.from_numpy(load('actions',np.float32,(E,T,2))[te:].copy());contact=torch.from_numpy(load('contact',np.uint8,(E,T))[te:].copy()).bool();n=E-te
encoders=[ProjectedKeypointEncoder(4),KeypointEncoder(1)]
for stream,enc in enumerate(encoders):enc.load_state_dict(torch.load(checkpoint/f'encoder{stream}.pt',weights_only=True));enc.eval()
model=EquivariantKeypointDynamics(rest_preserving=True);model.load_state_dict(torch.load(checkpoint/'dynamics.pt',weights_only=True));model.eval();decoder=LinearDiagnostic();decoder.load_state_dict(torch.load(checkpoint/'decoder.pt',weights_only=True));decoder.eval()
with torch.no_grad():
 features=[]
 for stream,enc in enumerate(encoders):
  arr=images.reshape(-1,2,64,64);features.append(torch.cat([enc(torch.from_numpy(arr[i:i+256,stream:stream+1].astype(np.float32)/255)) for i in range(0,len(arr),256)]))
 features=torch.cat(features,-1).reshape(n,T+1,24);states=torch.cat([features,torch.cat([features[:,:1],features[:,:-1]],1)],-1)
 report={'seed':731,'dynamicsSeed':733,'torch':torch.__version__,'numpy':np.__version__,'python':platform.python_version(),'dataset':meta,'representation_training':['explicit_pose_supervised_projected_keypoints','explicit_pose_supervised_agent_keypoint'],'trainingRecipe':'sh reproduce_keypoints.sh','prediction':[],'testEpisodes':n}
 for h in [1,3,5,8,16]:
  e=torch.arange(n).repeat_interleave(T-h);t=torch.arange(T-h).repeat(n);state=states[e,t]
  for k in range(h):state=model(state,actions[e,t+k])
  error=(state[:,:24]-features[e,t+h]).square().mean(-1);static=(states[e,t,:24]-features[e,t+h]).square().mean(-1);pose=decoder(state);target=labels[e,t+h];position=(pose[:,:2]-target[:,:2]).square().sum(-1).sqrt()*10;angle=torch.atan2(pose[:,2],pose[:,3])-torch.atan2(target[:,2],target[:,3]);angle=torch.atan2(angle.sin(),angle.cos()).abs();touch=torch.stack([contact[e,t+k] for k in range(h)]).any(0)
  report['prediction'].append({'horizon':h,'latent_mse_mean':error.mean().item(),'latent_mse_std':error.std().item(),'constant_state_mse':static.mean().item(),'position_mean_units':position.mean().item(),'position_std_units':position.std().item(),'orientation_mean_radians':angle.mean().item(),'orientation_std_radians':angle.std().item(),'contact_mse':error[touch].mean().item(),'noncontact_mse':error[~touch].mean().item(),'contactDefinition':'any true contact within prediction horizon'})
 sample=states[:,:-1].reshape(-1,48)[:256];report['action_sensitivity_mse']=(model(sample,torch.ones(256,2))-model(sample,-torch.ones(256,2))).square().mean().item()
 current=decoder(states.reshape(-1,48));target=labels.reshape(-1,9);report['current_position_mean_units']=(current[:,:2]-target[:,:2]).square().sum(-1).sqrt().mean().item()*10
report['elapsed_seconds']=json.loads((results/'keypoints-v6/training.json').read_text())['elapsedSeconds'];(results/'training.json').write_text(json.dumps(report,indent=2))
rows=[]
if '--merge-splits' in sys.argv:
 for difficulty in ['easy','medium','challenge']:
  p=results/f'release-v3-{difficulty}/planning-lite.json'
  if p.exists():rows.extend(json.loads(p.read_text())['rows'])
else:
 benchmark=json.loads((results/'planning-lite.json').read_text());rows=benchmark['rows']
 for name,record in benchmark.get('modelHashes',{}).items():
  assert record['sha256']==hashlib.sha256((release/f'{name}.onnx').read_bytes()).hexdigest(),'Benchmark model mismatch; rerun eval/planning.mjs'
model_files={n:{'sha256':hashlib.sha256((release/f'{n}.onnx').read_bytes()).hexdigest(),'bytes':(release/f'{n}.onnx').stat().st_size,'checkpointSha256':hashlib.sha256((checkpoint/f'{pt}.pt').read_bytes()).hexdigest()} for n,pt in [('object_encoder','encoder0'),('agent_encoder','encoder1'),('latent_dynamics','dynamics'),('diagnostic_decoder','decoder')]}
planning={'backend':'ONNX Runtime Web 1.21.0 WASM in Node, single thread; not browser or phone timing','timingScope':'CEM only; final difficulty runs executed concurrently','seeds':50,'seedBase':930000,'budget':100,'modelHashes':model_files,'rows':rows}
(results/'planning-lite.json').write_text(json.dumps(planning,indent=2));easy=[x for x in rows if x['difficulty']=='easy' and x['method']=='latent-mpc'];success=sum(x['success'] for x in easy)
metadata={'version':'tiny-world-planner-v2.2-keypoints','status':'experimental','objectLatent':16,'agentLatent':8,'stateDim':48,'resolution':64,'imageShape':['batch',1,64,64],'inputNormalization':'float32 soft color masks [0,1]; 2x2 antialiasing and 1/255 quantization','stateOrder':'current object16, current agent8, previous object16, previous agent8','objectFeatures':'four CNN spatial-softmax keypoints projected to a fixed T constellation; repeated twice / sqrt(2), in image-calibrated workspace units','agentFeatures':'CNN agent point repeated four times / 2','dynamicBatch':True,'opset':17,'actionShape':['batch',2],'actionNormalization':'[-1,1]^2; relative displacement .48 per axis in .1s','architecture':'pose-supervised CNN keypoints, rigid projection, object-frame learned residual transition with rest-preserving gate, learned pusher action matrix; separate fitted linear diagnostic head','pureSelfSupervised':False,'onlineAdaptation':False,'dataset':meta,'trainingSeeds':{'encoder':731,'dynamics':733},'models':model_files,'metrics':report['prediction'],'benchmark':{'seeds':'930000..930049','actions':100,'easySuccesses':success,'easyTrials':len(easy),'successCoverage':.95,'requiredConsecutiveActions':3,'reliabilityGatePassed':success>=25},'planner':{'light':{'horizon':8,'candidates':128,'iterations':6,'knots':4},'standard':{'horizon':8,'candidates':256,'iterations':8,'knots':4},'visualHoldThreshold':.0004},'demonstrationSeed':902005,'demonstrationSeedSelection':'selected from development successes; excluded from final benchmark and training','note':'Experimental fallback: explicitly pose-supervised visual keypoints and geometric rigidity/rest priors. The learned predictor sees image-derived latents and actions only. This is not purely self-supervised, not V-JEPA 2, and not a reliable general manipulation controller.'}
(release/'model_metadata.json').write_text(json.dumps(metadata,indent=2));fig,ax=plt.subplots(figsize=(6.5,3.2));m=report['prediction'];x=[v['horizon'] for v in m];ax.plot(x,[v['latent_mse_mean'] for v in m],'-o',label='Learned rigid latent predictor',color='#8161ae');ax.plot(x,[v['constant_state_mse'] for v in m],'-o',label='Constant-state baseline',color='#91a27f');ax.set(xlabel='Prediction horizon (actions)',ylabel='Held-out latent MSE',xticks=x);ax.spines[['top','right']].set_visible(False);ax.legend(frameon=False);ax.grid(alpha=.15);fig.tight_layout();fig.savefig(results/'prediction.png',dpi=160);plt.close(fig)
lines=['# Measured release results','','The release remains **experimental**. Perception is explicitly pose-supervised, with geometric priors; no privileged simulator state enters the deployed planner.','',f'Dynamics dataset: {E} episodes × {T} actions. True contact fraction {meta["contactFraction"]:.1%}. Encoder pretraining used a separate 700×80 dataset.','', '## Held-out image-conditioned prediction','','| Horizon | Latent MSE ± SD | Static MSE | Position error (units) | Angle error (rad) |','|---:|---:|---:|---:|---:|']
for v in m:lines.append(f'| {v["horizon"]} | {v["latent_mse_mean"]:.5f} ± {v["latent_mse_std"]:.5f} | {v["constant_state_mse"]:.5f} | {v["position_mean_units"]:.4f} | {v["orientation_mean_radians"]:.4f} |')
lines+=['','## Reserved planning benchmark','','50 seeds 930000–930049 per difficulty; paired random actions and neural MPC; 100-action budget. Success requires ≥95% actual geometric coverage for three consecutive actions.','', '| Difficulty | Method | Success | Mean final coverage | Mean CEM time |','|---|---|---:|---:|---:|']
for difficulty in ['easy','medium','challenge']:
 for method in ['random','latent-mpc']:
  r=[v for v in rows if v['difficulty']==difficulty and v['method']==method]
  if r:lines.append(f'| {difficulty} | {method} | {sum(v["success"] for v in r)}/{len(r)} | {np.mean([v["finalCoverage"] for v in r]):.1%} | {np.mean([v["latencyMean"] for v in r]):.1f} ms |')
lines+=['',f'**Reliability gate: {"PASS" if success>=25 else "NOT MET"}.** {success}/{len(easy)} easy successes; target was ≥25/50. These results must not be presented as a reliable controller.','', 'Timing above is Node WASM CEM under concurrent evaluation load, excluding observation encoding and diagnostic decoding. Browser measurements are separate in `browser.json`; mobile viewports are emulated, not physical Android timings.','','Default seed 902005 is a selected development demonstration, not a final benchmark seed. It succeeds through fresh neural CEM execution, not a replay or scripted controller. Goal edits and disturbances can fail.','','The original release is retained under `original-release/`. A paired original-controller evaluation on the new easy seeds is under `original-on-new-seeds/`. Privileged oracle diagnostics remain offline under tools; none is imported or substituted by the website.','','Development included negative short/long horizon, online residual, and introductory-scene experiments. They are not the final held-out benchmark.']
(results/'RESULTS.md').write_text('\n'.join(lines)+'\n');print('\n'.join(lines))
