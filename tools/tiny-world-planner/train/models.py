import torch
from torch import nn

class Encoder(nn.Module):
    def __init__(self,dim):
        super().__init__()
        self.net=nn.Sequential(nn.Conv2d(1,8,5,2,2),nn.ReLU(),nn.Conv2d(8,16,3,2,1),nn.ReLU(),nn.Conv2d(16,16,3,2,1),nn.ReLU(),nn.Flatten(),nn.Linear(1024,64),nn.ReLU(),nn.Linear(64,dim))
    def forward(self,image):return self.net(image)

class NormalizedEncoder(nn.Module):
    def __init__(self,encoder,mean,std):
        super().__init__();self.encoder=encoder;self.register_buffer('mean',mean);self.register_buffer('std',std)
    def forward(self,image):return (self.encoder(image)-self.mean)/self.std

class Dynamics(nn.Module):
    def __init__(self):
        super().__init__();self.net=nn.Sequential(nn.Linear(50,192),nn.ReLU(),nn.Linear(192,192),nn.ReLU(),nn.Linear(192,24))
    def forward(self,state,action):
        nxt=state[:,:24]+self.net(torch.cat([state,action],-1))
        return torch.cat([nxt,state[:,:24]],-1)

class Decoder(nn.Module):
    def __init__(self):
        super().__init__();self.net=nn.Sequential(nn.Linear(24,96),nn.ReLU(),nn.Linear(96,96),nn.ReLU(),nn.Linear(96,6))
    def forward(self,state):return self.net(state[:,:24])

def vicreg(a,b):
    inv=(a-b).square().mean();var=torch.relu(1-torch.sqrt(a.var(0)+1e-4)).mean()+torch.relu(1-torch.sqrt(b.var(0)+1e-4)).mean()
    ac=a-a.mean(0);bc=b-b.mean(0);ca=ac.T@ac/(len(a)-1);cb=bc.T@bc/(len(b)-1)
    off=lambda c:(c.square().sum()-c.diag().square().sum())/c.shape[0]
    return 25*inv+25*var+off(ca)+off(cb)
