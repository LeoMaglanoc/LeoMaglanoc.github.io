"""Verify native inverse dynamics transfers to MuJoCo, then measure open loop.

Prescribed-force test disables contacts to avoid counting foot forces twice.
"""
from pathlib import Path
import json,numpy as np,mujoco as mj
from scipy.spatial.transform import Rotation
root=Path('/workspace/projects/locomotion-playground')
mapdata=json.loads((root/'robots/b2z1/joint-map.json').read_text());mapping=mapdata['mapping']
def assign(d,f):
 q,v=f['q'],f['v'];d.qpos[:3]=q[:3];d.qpos[3:7]=[q[6],*q[3:6]]
 rot=Rotation.from_quat(q[3:7]);d.qvel[:3]=rot.apply(v[:3]);d.qvel[3:6]=v[3:6]
 for j in mapping:d.qpos[j['mj_q']]=q[j['pin_q']];d.qvel[j['mj_v']]=v[j['pin_v']]
 return rot
reports=[]
for gait in ['stand','walk','trot']:
 frames=json.loads((root/f'results/{gait}.json').read_text())['frames']
 model=mj.MjModel.from_xml_path(str(root/'robots/b2z1/scene.xml'));data=mj.MjData(model)
 model.geom_contype[:]=0;model.geom_conaffinity[:]=0
 errors=[]
 for i in [0,20,60,100]:
  f=frames[i];rot=assign(data,f);data.qfrc_applied[:]=0
  for j in mapping:data.ctrl[j['actuator']]=f['tau'][j['pin_v']-6]
  mj.mj_forward(model,data)
  for foot,name in enumerate(mapdata['feet']+['gripperCenterLink']):
   body=mj.mj_name2id(model,mj.mjtObj.mjOBJ_BODY,name)
   mj.mj_applyFT(model,data,np.array(f['contact_forces'][foot*3:foot*3+3]),np.zeros(3),data.xpos[body],body,data.qfrc_applied)
  mj.mj_forward(model,data)
  a=np.array(f['a']);expected=np.concatenate([rot.apply(a[:3]+np.cross(f['v'][3:6],f['v'][:3])),a[3:6],np.array([a[j['pin_v']] for j in sorted(mapping,key=lambda j:j['mj_v'])])])
  errors.append(float(np.max(np.abs(data.qacc-expected))))
 assert max(errors)<1e-3, (gait,errors)
 model=mj.MjModel.from_xml_path(str(root/'robots/b2z1/scene.xml'));data=mj.MjData(model);assign(data,frames[0]);mj.mj_forward(model,data)
 checkpoints={}
 for step in range(int(frames[-1]['t']/.002)):
  t=step*.002;f=frames[min(len(frames)-1,int(t/.015))]
  for j in mapping:data.ctrl[j['actuator']]=f['tau'][j['pin_v']-6]
  mj.mj_step(model,data)
  if step in [22,149,499,799]:checkpoints[str(round(t+.002,3))]=dict(base_error_m=float(np.linalg.norm(data.qpos[:3]-np.array(f['q'][:3]))),base_height_m=float(data.qpos[2]))
 # A position/velocity tracking servo tests transfer of exported control
 # targets. It is explicitly an execution layer, not a replacement optimizer.
 model=mj.MjModel.from_xml_path(str(root/'robots/b2z1/scene.xml'));data=mj.MjData(model);assign(data,frames[0]);mj.mj_forward(model,data)
 tracking={}
 for step in range(int(frames[-1]['t']/.002)):
  t=step*.002;f=frames[min(len(frames)-1,int(t/.015))]
  for j in mapping:
   arm=j['name'].startswith('joint');kp,kd=(80,8) if arm else (800,40)
   torque=f['tau'][j['pin_v']-6]+kp*(f['q'][j['pin_q']]-data.qpos[j['mj_q']])+kd*(f['v'][j['pin_v']]-data.qvel[j['mj_v']])
   data.ctrl[j['actuator']]=np.clip(torque,*model.actuator_ctrlrange[j['actuator']])
  mj.mj_step(model,data)
  if step in [22,149,499,799]:tracking[str(round(t+.002,3))]=dict(base_error_m=float(np.linalg.norm(data.qpos[:3]-np.array(f['q'][:3]))),base_height_m=float(data.qpos[2]))
 reports.append(dict(gait=gait,prescribed_force_acceleration_error_max=max(errors),open_loop=checkpoints,tracking_servo=tracking,finite=bool(np.isfinite(data.qpos).all())))
(root/'results/replay-validation.json').write_text(json.dumps(reports,indent=2));print(json.dumps(reports,indent=2))
