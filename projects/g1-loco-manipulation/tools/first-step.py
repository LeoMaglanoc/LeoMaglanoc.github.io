import mujoco,json,numpy as np
from pathlib import Path
R=Path('projects/g1-loco-manipulation');c=json.loads((R/'config.json').read_text());f=json.loads((R/'fixture-carrybox.json').read_text())['frames'][0];m=mujoco.MjModel.from_xml_path(str(R/'robots/carrybox.xml'));m.opt.disableflags |= 524288;d=mujoco.MjData(m);d.qpos[:]=f['qpos'];d.qvel[:]=f['qvel'];d.mocap_pos[:]=f['mocap'][:2];mujoco.mj_forward(m,d)
target=(np.array(f['actions'])*c['action_scale_lab']+c['default_angles_lab'])[c['lab2mj']]
res={'initial':{p:getattr(d,p).reshape(-1).tolist() for p in ['M','qfrc_bias','qfrc_passive','qacc','qacc_warmstart']},'steps':[]}
for i in range(4):
 d.ctrl[:]=np.clip(np.array(c['stiffness'])*(target-d.qpos[7:36])-np.array(c['damping'])*d.qvel[6:35],-np.array(c['torque_limits']),c['torque_limits']);mujoco.mj_step(m,d)
 res['steps'].append({p:getattr(d,p).reshape(-1).tolist() for p in ['qpos','qvel','qacc','qfrc_constraint','ctrl','qacc_warmstart','efc_force','efc_state']})
 res['steps'][-1]['contacts']=[{'geom':x.geom.tolist(),'dist':float(x.dist),'pos':x.pos.tolist(),'frame':x.frame.tolist()} for x in d.contact]
(R/'artifacts'/'first-step.json').write_text(json.dumps(res))
