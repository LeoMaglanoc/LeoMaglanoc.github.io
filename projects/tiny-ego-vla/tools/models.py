"""Sub-million-parameter shared trunks; embodiment-specific prediction heads."""
import math
import torch
from torch import nn
class Trunk(nn.Module):
    def __init__(self,kind='gru',hidden=128,context=4):
        super().__init__(); self.kind=kind; self.hidden=hidden; self.context=context
        self.visual=nn.Sequential(nn.Linear(512,hidden),nn.LayerNorm(hidden),nn.GELU())
        self.language=nn.Sequential(nn.Linear(512,64),nn.LayerNorm(64),nn.GELU())
        if kind=='gru': self.temporal=nn.GRU(hidden,hidden,batch_first=True)
        elif kind=='mlp': self.temporal=nn.Sequential(nn.Flatten(),nn.Linear(context*hidden,hidden),nn.GELU())
        elif kind=='transformer':
            self.position=nn.Parameter(torch.zeros(1,context,hidden))
            layer=nn.TransformerEncoderLayer(hidden,4,hidden*2,dropout=0,batch_first=True,norm_first=True)
            self.temporal=nn.TransformerEncoder(layer,2,enable_nested_tensor=False)
        else: raise ValueError(kind)
        self.fuse=nn.Sequential(nn.Linear(hidden+64,hidden),nn.LayerNorm(hidden),nn.GELU())
    def forward(self,visual,text):
        x=self.visual(visual*math.sqrt(512))
        if self.kind=='gru': x=self.temporal(x)[0][:,-1]
        elif self.kind=='mlp': x=self.temporal(x)
        else: x=self.temporal(x+self.position)[:,-1]
        return self.fuse(torch.cat([x,self.language(text*math.sqrt(512))],dim=-1))
class EgoModel(nn.Module):
    def __init__(self,kind='gru'):
        super().__init__(); self.trunk=Trunk(kind); self.head=nn.Linear(128,5)
    def forward(self,v,l): return self.head(self.trunk(v,l))
class RobotModel(nn.Module):
    def __init__(self,kind='gru'):
        super().__init__(); self.trunk=Trunk(kind)
        self.proprio=nn.Sequential(nn.Linear(8,32),nn.GELU())
        self.head=nn.Sequential(nn.Linear(160,128),nn.GELU(),nn.Linear(128,14))
    def forward(self,v,l,p): return self.head(torch.cat([self.trunk(v,l),self.proprio(p)],dim=-1))
def count_params(model): return sum(p.numel() for p in model.parameters() if p.requires_grad)
