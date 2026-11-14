"""Privileged learned state dynamics; offline comparison only, never exported."""
import gzip,json
from pathlib import Path
import numpy as np
import torch
from torch import nn
torch.manual_seed(815);torch.set_num_threads(4)
root=Path('local-data');m=json.loads((root/'metadata.json').read_text());E,T=m['episodes'],m['steps'];tr=int(.8*E);te=int(.9*E)
s=torch.from_numpy(np.frombuffer(gzip.decompress((root/'states.bin.gz').read_bytes()),dtype=np.float32).copy().reshape(E,T+1,9));a=torch.from_numpy(np.frombuffer(gzip.decompress((root/'actions.bin.gz').read_bytes()),dtype=np.float32).copy().reshape(E,T,2));std=s[:tr].std((0,1)).clamp_min(.05);mean=s[:tr].mean((0,1));s=(s-mean)/std
model=nn.Sequential(nn.Linear(11,128),nn.ReLU(),nn.Linear(128,128),nn.ReLU(),nn.Linear(128,9));opt=torch.optim.Adam(model.parameters(),lr=.001)
for step in range(1500):
 e=torch.randint(tr,(256,));t=torch.randint(T,(256,));pred=s[e,t]+model(torch.cat([s[e,t],a[e,t]],-1));loss=(pred-s[e,t+1]).square().mean();opt.zero_grad();loss.backward();opt.step()
with torch.no_grad():
 x=s[te:,:-1];target=s[te:,1:];pred=x+model(torch.cat([x,a[te:]],-1));mse=(pred-target).square().mean().item();static=(x-target).square().mean().item()
r={'label':'privileged learned numerical dynamics baseline — offline only','seed':815,'oneStepNormalizedStateMSE':mse,'constantStateMSE':static,'betterThanStatic':mse<static};Path('results/state-baseline.json').write_text(json.dumps(r,indent=2));print(r)
