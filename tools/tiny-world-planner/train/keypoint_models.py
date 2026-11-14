"""Explicitly pose-supervised visual-keypoint fallback.

Runtime inputs remain images/actions. Rigid transforms are a learned dynamics
parameterization, not contact physics or a simulator-state controller.
"""
import math
import torch
from torch import nn

class KeypointEncoder(nn.Module):
    def __init__(self,points):
        super().__init__();self.points=points
        self.net=nn.Sequential(nn.Conv2d(1,16,5,2,2),nn.ReLU(),nn.Conv2d(16,16,3,1,2,dilation=2),nn.ReLU(),nn.Conv2d(16,16,3,1,2,dilation=2),nn.ReLU(),nn.Conv2d(16,16,3,1,1),nn.ReLU(),nn.Conv2d(16,points,1))
        grid=(torch.arange(32)*2+.5)/64
        yy,xx=torch.meshgrid(grid,grid,indexing='ij');self.register_buffer('grid',torch.stack([xx.flatten(),yy.flatten()],-1))
    def maps(self,image):return self.net(image).flatten(2)
    def coordinates(self,image):return torch.softmax(self.maps(image),-1)@self.grid
    def forward(self,image):
        coordinates=self.coordinates(image).flatten(1)*10
        copies=2 if self.points==4 else 4
        return coordinates.repeat(1,copies)/math.sqrt(copies)

class ProjectedKeypointEncoder(KeypointEncoder):
    """Project learned image points onto a fixed rigid feature constellation.

    This removes non-rigid feature jitter; no simulator pose is read at runtime.
    The known T constellation is an explicit supervised geometric prior.
    """
    def forward(self,image):
        points=self.coordinates(image)*10;center=points.mean(1,keepdim=True);relative=points-center
        reference=torch.tensor([[-.9,-.725],[.9,-.725],[0,.85],[0,-.2]],dtype=points.dtype,device=points.device)
        reference=reference-reference.mean(0,keepdim=True)
        dot=(reference[None,:,0]*relative[:,:,0]+reference[None,:,1]*relative[:,:,1]).sum(1,keepdim=True)
        cross=(reference[None,:,0]*relative[:,:,1]-reference[None,:,1]*relative[:,:,0]).sum(1,keepdim=True)
        norm=torch.sqrt(dot.square()+cross.square()+1e-8);c,s=dot/norm,cross/norm
        x=reference[None,:,0]*c-reference[None,:,1]*s;y=reference[None,:,0]*s+reference[None,:,1]*c
        return (torch.stack([x,y],-1)+center).flatten(1).repeat(1,2)/math.sqrt(2)

class RigidKeypointDynamics(nn.Module):
    def __init__(self):
        super().__init__();self.net=nn.Sequential(nn.Linear(26,192),nn.SiLU(),nn.Linear(192,192),nn.SiLU(),nn.Linear(192,192),nn.SiLU(),nn.Linear(192,4))
        self.agent=nn.Linear(2,2,bias=False)
        nn.init.zeros_(self.net[-1].weight);nn.init.zeros_(self.net[-1].bias);nn.init.zeros_(self.agent.weight)
        with torch.no_grad():self.net[-1].bias[3]=-2
    def forward(self,state,action):
        points=(state[:,:8]*math.sqrt(2)).reshape(-1,4,2);agent=state[:,16:18]*2
        previous=(state[:,24:32]*math.sqrt(2)).reshape(-1,4,2);previous_agent=state[:,40:42]*2
        center=points.mean(1);relative=points-center[:,None]
        inputs=torch.cat([relative.flatten(1),agent-center,(points-previous).flatten(1),agent-previous_agent,action,center/10,agent/10],-1)
        parameters=self.net(inputs);gate=torch.sigmoid(parameters[:,3:4]);translation=.8*torch.tanh(parameters[:,:2])*gate;angle=1.2*torch.tanh(parameters[:,2:3])*gate
        c,s=torch.cos(angle),torch.sin(angle);x=relative[:,:,0]*c-relative[:,:,1]*s;y=relative[:,:,0]*s+relative[:,:,1]*c
        next_points=torch.stack([x,y],-1)+center[:,None]+translation[:,None]
        next_agent=torch.clamp(agent+self.agent(action),.23,9.77)
        obj=next_points.flatten(1).repeat(1,2)/math.sqrt(2);ag=next_agent.repeat(1,4)/2
        return torch.cat([obj,ag,state[:,:24]],-1)

class LinearDiagnostic(nn.Module):
    def __init__(self):super().__init__();self.linear=nn.Linear(24,6)
    def forward(self,state):return self.linear(state[:,:24])

class EquivariantKeypointDynamics(RigidKeypointDynamics):
    """Predict local feature motion in the learned keypoints' own reference frame.

    This is a geometric architecture prior, not a contact equation: the MLP
    must still learn all object motion from image/action transitions.
    """
    def __init__(self,rest_preserving=False):
        super().__init__();self.rest_preserving=rest_preserving;self.net=nn.Sequential(nn.Linear(21,192),nn.ReLU(),nn.Linear(192,192),nn.ReLU(),nn.Linear(192,192),nn.ReLU(),nn.Linear(192,4))
        nn.init.zeros_(self.net[-1].weight);nn.init.zeros_(self.net[-1].bias)
        with torch.no_grad():self.net[-1].bias[3]=-2
    def forward(self,state,action):
        points=(state[:,:8]*math.sqrt(2)).reshape(-1,4,2);agent=state[:,16:18]*2
        previous=(state[:,24:32]*math.sqrt(2)).reshape(-1,4,2);previous_agent=state[:,40:42]*2
        center=points.mean(1);relative=points-center[:,None];bar=points[:,1]-points[:,0];axis=bar/torch.sqrt(bar.square().sum(-1,keepdim=True)+1e-6)
        c,s=axis[:,0:1],axis[:,1:2]
        def local(v):return torch.cat([v[:,0:1]*c+v[:,1:2]*s,-v[:,0:1]*s+v[:,1:2]*c],-1)
        shape=torch.stack([relative[:,:,0]*c+relative[:,:,1]*s,-relative[:,:,0]*s+relative[:,:,1]*c],-1)
        previous_bar=previous[:,1]-previous[:,0];previous_axis=previous_bar/torch.sqrt(previous_bar.square().sum(-1,keepdim=True)+1e-6)
        omega=(previous_axis[:,0:1]*s-previous_axis[:,1:2]*c)
        bounds=torch.stack([points[:,:,0].amin(1),10-points[:,:,0].amax(1),points[:,:,1].amin(1),10-points[:,:,1].amax(1)],-1)/10
        inputs=torch.cat([local(agent-center),local(action),local(agent-previous_agent),local(center-previous.mean(1)),omega,shape.flatten(1),bounds],-1)
        activity=(torch.linalg.vector_norm(action,dim=-1,keepdim=True)+4*torch.linalg.vector_norm(center-previous.mean(1),dim=-1,keepdim=True)+4*omega.abs()).clamp(max=1) if self.rest_preserving else torch.ones_like(omega)
        parameters=self.net(inputs);gate=torch.sigmoid(parameters[:,3:4])*activity;translation=.8*torch.tanh(parameters[:,:2])*gate;angle=1.2*torch.tanh(parameters[:,2:3])*gate
        world_translation=torch.cat([translation[:,0:1]*c-translation[:,1:2]*s,translation[:,0:1]*s+translation[:,1:2]*c],-1)
        ca,sa=torch.cos(angle),torch.sin(angle);x=relative[:,:,0]*ca-relative[:,:,1]*sa;y=relative[:,:,0]*sa+relative[:,:,1]*ca
        next_points=torch.stack([x,y],-1)+center[:,None]+world_translation[:,None]
        next_agent=torch.clamp(agent+self.agent(action),.23,9.77)
        return torch.cat([next_points.flatten(1).repeat(1,2)/math.sqrt(2),next_agent.repeat(1,4)/2,state[:,:24]],-1)
