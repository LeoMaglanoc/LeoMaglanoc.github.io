"""Live actuator controller and contact/placement oracle. Only reset writes qpos."""
import json,hashlib
from pathlib import Path
import mujoco as mj
import numpy as np
ROOT=Path(__file__).resolve().parents[1]
DURATIONS=dict(APPROACH=3,DESCEND=3,CLOSE=1.5,LIFT=3,TRANSFER=5,LOWER=3,RELEASE=1.5,RETREAT=3)
class Simulation:
 def __init__(self,obj='cube',offset=(0,0),disable_contacts=False):
  self.ref=json.loads((ROOT/'references'/f'{obj}.json').read_text()); self.side=self.ref['side'];self.obj=obj
  assert hashlib.sha256((ROOT/'scene/bimanual_scene.xml').read_bytes()).hexdigest()==self.ref['scene_sha256'],'Stale references: regenerate'
  self.m=mj.MjModel.from_xml_path(str(ROOT/'scene/bimanual_scene.xml'));self.d=mj.MjData(self.m);m=self.m;d=self.d
  self.qa=np.array([m.joint(f'{self.side}_joint{i+1}').qposadr[0] for i in range(6)])
  self.va=np.array([m.joint(f'{self.side}_joint{i+1}').dofadr[0] for i in range(6)])
  self.ca=np.array([m.actuator(f'{self.side}_joint{i+1}').id for i in range(6)]);self.ga=m.actuator(self.side+'_gripper').id
  self.ob=m.body(obj).id;self.oq=m.joint(obj+'_free').qposadr[0];self.ov=m.joint(obj+'_free').dofadr[0]
  self.fingers={m.body(self.side+'_'+n).id for n in ['lf_down','rf_down','lf_rot','rf_rot']}
  for side in ['left','right']:
   for i,q in enumerate(self.ref['home']):
    d.qpos[m.joint(f'{side}_joint{i+1}').qposadr]=q;d.ctrl[m.actuator(f'{side}_joint{i+1}').id]=q
   d.qpos[m.joint(side+'_left_finger').qposadr]=.0375;d.qpos[m.joint(side+'_right_finger').qposadr]=-.0375;d.ctrl[m.actuator(side+'_gripper').id]=.0375
  d.qpos[self.oq:self.oq+2]+=offset
  if disable_contacts:
   for i in range(m.ngeom):
    if m.geom_bodyid[i]==self.ob:m.geom_contype[i]=0;m.geom_conaffinity[i]=0
  mj.mj_forward(m,d)
  for _ in range(500):mj.mj_step(m,d)
  self.base=float(d.qpos[self.oq+2]);self.index=0;self.phase='HOME';self.start=d.time;self.lift_dwell=0.;self.place_dwell=0.;self.lost=0.;self.grasped=False;self.reason='';self.trace=[];self.samples=[];self.max_lift=0.;self.enter(0)
 def contacts(self):
  finger=0;table=0
  for c in self.d.contact:
   a,b=int(c.geom1),int(c.geom2)
   if self.m.geom_bodyid[a]==self.ob or self.m.geom_bodyid[b]==self.ob:
    other=b if self.m.geom_bodyid[a]==self.ob else a
    if self.m.geom_bodyid[other] in self.fingers:finger+=1
    if other==self.m.geom('tabletop').id:table+=1
  return finger,table
 def state(self):
  finger,table=self.contacts();p=self.d.qpos[self.oq:self.oq+3].copy();v=self.d.qvel[self.ov:self.ov+3].copy()
  err=float(np.max(np.abs(self.d.qpos[self.qa]-self.ref['waypoints'][min(self.index,7)]['q'])))
  return dict(time=float(self.d.time),phase=self.phase,pos=p.tolist(),velocity=v.tolist(),finger_contacts=finger,table_contacts=table,joint_error=err,qpos=self.d.qpos[self.qa].tolist(),ctrl=self.d.ctrl[self.ca].tolist(),grip=float(self.d.qpos[self.m.joint(self.side+'_left_finger').qposadr[0]]))
 def enter(self,index):
  self.index=index;self.phase=self.ref['waypoints'][index]['phase'] if index<8 else 'VERIFY_PLACE';self.start=float(self.d.time);self.fromg=float(self.d.ctrl[self.ga]);self.trace.append(self.state())
 def fail(self,reason):
  self.reason=reason;self.phase='FAILED';self.trace.append(self.state())
 def tick(self):
  if self.phase in ['DONE','FAILED']:return
  m,d=self.m,self.d;dt=m.opt.timestep;elapsed=d.time-self.start
  if self.index<8:
   w=self.ref['waypoints'][self.index];duration=DURATIONS[self.phase];u=float(np.clip(elapsed/duration,0,1));s=u*u*(3-2*u)
   path=np.array(w['qs']);v=s*(len(path)-1);k=min(int(v),len(path)-2)
   d.ctrl[self.ca]=path[k]+(v-k)*(path[k+1]-path[k]);d.ctrl[self.ga]=self.fromg+s*(w['grip']-self.fromg)
  mj.mj_step(m,d)
  finger,table=self.contacts();p=d.qpos[self.oq:self.oq+3];speed=np.linalg.norm(d.qvel[self.ov:self.ov+3]);height=float(p[2]-self.base);self.max_lift=max(self.max_lift,height)
  self.lift_dwell=self.lift_dwell+dt if finger>0 and height>=.05 else 0
  if self.lift_dwell>=.2:self.grasped=True
  if self.grasped and (self.phase in ['LIFT','TRANSFER'] or (self.phase=='LOWER' and table==0)):
   self.lost=self.lost+dt if finger==0 else 0
   if self.lost>.15:self.fail('Lost finger contact during transport');return
  else:self.lost=0.
  if self.index<8:
   err=np.max(np.abs(d.qpos[self.qa]-w['q']));vel=np.max(np.abs(d.qvel[self.va]))
   ready=elapsed>=duration+.3 and err<.02 and vel<.15
   if self.phase=='CLOSE':ready=ready and finger>0
   if self.phase=='LIFT':ready=ready and self.grasped and finger>0
   if ready:self.enter(self.index+1)
   elif elapsed>duration+4:self.fail(f'{self.phase} timeout: joint_error={err:.4f}, contacts={finger}, lift={height:.4f}')
  else:
   placed=self.grasped and table>0 and finger==0 and np.linalg.norm(p[:2]-self.ref['goal'])<.05 and speed<.05 and abs(height)<.015
   self.place_dwell=self.place_dwell+dt if placed else 0
   if self.place_dwell>=.5:self.phase='DONE';self.trace.append(self.state())
   elif elapsed>4:self.fail('Placement oracle timeout')
  if round(d.time/dt)%50==0:self.samples.append(self.state())
 def run(self):
  while self.phase not in ['DONE','FAILED']:self.tick()
  return dict(object=self.obj,success=self.phase=='DONE',reason=self.reason,grasped=self.grasped,max_lift=self.max_lift,trace=self.trace,samples=self.samples)
if __name__=='__main__':
 import sys
 result=Simulation(sys.argv[1] if len(sys.argv)>1 else 'cube').run();print(json.dumps(result,indent=2))
 raise SystemExit(0 if result['success'] else 1)
