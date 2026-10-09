import mujoco,json,numpy as np
from pathlib import Path
R=Path('projects/g1-loco-manipulation');cfg=json.loads((R/'config.json').read_text());report={}
for task in ['carrybox','pushbox']:
 m=mujoco.MjModel.from_xml_path(str(R/'robots'/f'{task}.xml'));m.opt.timestep=.005;m.opt.disableflags |= 524288;d=mujoco.MjData(m);j=json.loads((R/f'fixture-{task}.json').read_text());err=0
 for i,f in enumerate(j['frames'][:-1]):
  mujoco.mj_resetData(m,d);d.qpos[:]=f['qpos'];d.qvel[:]=f['qvel'];d.mocap_pos[:]=np.array(f['mocap'][:2]);mujoco.mj_forward(m,d)
  target=(np.array(f['actions'])*cfg['action_scale_lab']+cfg['default_angles_lab'])[cfg['lab2mj']]
  for k in range(4):
   d.ctrl[:]=np.clip(np.array(cfg['stiffness'])*(target-d.qpos[7:36])-np.array(cfg['damping'])*d.qvel[6:35],-np.array(cfg['torque_limits']),cfg['torque_limits']);mujoco.mj_step(m,d)
  dif=np.abs(d.qpos-np.array(j['frames'][i+1]['qpos']));err=max(err,float(dif.max()))
  print(task,i,np.argmax(dif),float(dif.max()))
  if i==0: print('ctrl',d.ctrl.tolist())
 report[task]=err
print(report)
