from common import *
import numpy as np, torch
from torch.utils.data import Dataset
CONFIG=json.loads((PROJECT/'configs/experiment.json').read_text())
def history(v,t,k=4): return v[np.maximum(np.arange(t-k+1,t+1),0)]
class EgoDataset(Dataset):
    def __init__(self,split):
        self.rows=[]
        for video in CONFIG['ego_sources'][split]:
            cache=np.load(DATA/f'{video}_embeddings.npz')
            meta=json.loads((DATA/f'{video}_labels.json').read_text())
            v=cache['visual']; texts=cache['text']; ids=cache['instruction_ids']; h=CONFIG['future_frames']
            for t in range(3,len(v)-h):
                if meta['segments'][t]!=meta['segments'][t+h] or meta['segments'][t].endswith('_gap'): continue
                target=np.zeros(5,dtype='float32'); mask=np.zeros(5,dtype='float32')
                # Match nearby wrist positions; reject large jumps and missing detections.
                a=meta['hands'][t]; b=meta['hands'][t+h]
                if a and b:
                    pairs=[(np.linalg.norm(np.array(y[0])-x[0]),x,y) for x in a for y in b]
                    dist,x,y=min(pairs,key=lambda q:q[0])
                    if dist<.35:
                        target[:2]=(np.array(y[0])-x[0])*10; mask[:2]=1
                a=meta['objects'][t]; b=meta['objects'][t+h]
                if a and b:
                    ca=(np.array(a[:2])+a[2:4])/2; cb=(np.array(b[:2])+b[2:4])/2
                    if np.linalg.norm(ca-cb)<.25:
                        target[2:4]=(cb-ca)*10; mask[2:4]=1
                if meta['contact'][t+h] is not None:
                    target[4]=meta['contact'][t+h]; mask[4]=1
                if mask[:4].sum()==0: continue
                self.rows.append((history(v,t),texts[ids[t]],target,mask,video,t))
    def __len__(self): return len(self.rows)
    def __getitem__(self,i): return tuple(torch.from_numpy(x) for x in self.rows[i][:4])
class RobotDataset(Dataset):
    def __init__(self,split,budget=35,norm=None):
        self.rows=[]
        start,end=CONFIG['robot_split'][split]
        if split=='train': end=min(end,budget)
        for task in CONFIG['robot_tasks']:
            for i in range(start,end):
                d=np.load(DATA/f'{task}_demo_{i:02d}.npz')
                v=d['visual']; p=d['proprio']; a=d['actions'].reshape(-1,14); txt=d['text']
                for t in range(len(v)): self.rows.append((history(v,t),txt,p[t],a[t],task,i,t))
        if norm is None:
            ps=np.array([r[2] for r in self.rows]); acts=np.array([r[3] for r in self.rows])
            norm={ 'p_mean':ps.mean(0),'p_std':np.maximum(ps.std(0),.01),'a_mean':acts.mean(0),'a_std':np.maximum(acts.std(0),.05)}
        self.norm=norm
    def __len__(self): return len(self.rows)
    def __getitem__(self,i):
        v,l,p,a,*_=self.rows[i]; n=self.norm
        return tuple(torch.from_numpy(np.asarray(x,dtype='float32')) for x in (v,l,(p-n['p_mean'])/n['p_std'],(a-n['a_mean'])/n['a_std']))
