"""Exercise the upstream MPC with feedback from MuJoCo and a joint servo."""
import os,sys,json,time
from pathlib import Path
import numpy as np, pinocchio as pin, mujoco as mj
from scipy.spatial.transform import Rotation
sys.path.insert(0,'/opt/wb-mpc');os.chdir('/opt/wb-mpc')
import main as upstream
from optimization import make_ocp
from args import DYN_ARGS,SOLVER_ARGS
root=Path('/workspace/projects/locomotion-playground');mapping=json.loads((root/'robots/b2z1/joint-map.json').read_text())['mapping']
reports=[]
for gait in ['stand','walk','trot']:
 robot=upstream.B2_Z1(reference_pose='standing_with_arm_up',arm_joints=4);robot.set_gait_sequence(gait,.8);pin.computeAllTerms(robot.model,robot.data,robot.q0,np.zeros(22))
 ocp=make_ocp(dynamics='whole_body_rnea',dyn_args=DYN_ARGS['whole_body_rnea'],robot=robot,nodes=14,tau_nodes=3,warm_start=True);ocp.set_time_params(.015,.08);ocp.set_swing_params(.07,[.1,-.2]);ocp.set_tracking_targets([0 if gait=='stand' else .1,0,0,0,0,0],[0,0,0],[0,0,0]);ocp.update_params(ocp.x_nom,0);ocp.init_solver('fatrop',{'opts':dict(SOLVER_ARGS['fatrop']['opts'],**{'fatrop.max_iter':200,'print_time':False})})
 model=mj.MjModel.from_xml_path(str(root/'robots/b2z1/scene.xml'));data=mj.MjData(model)
 q=robot.q0;data.qpos[:3]=q[:3];data.qpos[3:7]=q[[6,3,4,5]]
 for j in mapping:data.qpos[j['mj_q']]=q[j['pin_q']]
 mj.mj_forward(model,data);samples=[];previous=None
 for k in range(60):
  q=np.concatenate([data.qpos[:3],data.qpos[4:7],[data.qpos[3]],np.zeros(16)]);v=np.concatenate([Rotation.from_quat(q[3:7]).inv().apply(data.qvel[:3]),data.qvel[3:6],np.zeros(16)])
  for j in mapping:q[j['pin_q']]=data.qpos[j['mj_q']];v[j['pin_v']]=data.qvel[j['mj_v']]
  ocp.update_params(np.concatenate([q,v]),data.time)
  if previous is not None:ocp.opti.set_initial(ocp.opti.x,previous)
  params=ocp.get_solver_params();start=time.perf_counter();sol=ocp.solver_function(*params);previous=sol;ms=(time.perf_counter()-start)*1000
  g,lb,ub=ocp.g_data(sol,ocp.opti.value(ocp.opti.p));cv=float(ocp.constr_viol_norm_inf(g,lb,ub))
  for name in ['q_sol','v_sol','a_sol','forces_sol','tau_sol']:getattr(ocp,name).clear()
  ocp.retract_stacked_sol(sol,retract_all=True);tau=np.asarray(ocp.tau_sol[0]).flatten();qt=np.asarray(ocp.q_sol[1]).flatten();vt=np.asarray(ocp.v_sol[1]).flatten()
  samples.append(dict(t=data.time,base_height=float(data.qpos[2]),violation=cv,solve_ms=ms))
  if cv>1e-3:break
  for step in range(8 if k%2 else 7):
   for j in mapping:
    i=j['pin_v']-6;kp,kd=(80,8) if i>=12 else (800,40)
    ctrl=tau[i]+kp*(qt[j['pin_q']]-data.qpos[j['mj_q']])+kd*(vt[j['pin_v']]-data.qvel[j['mj_v']])
    data.ctrl[j['actuator']]=np.clip(ctrl,*model.actuator_ctrlrange[j['actuator']])
   mj.mj_step(model,data)
 report=dict(gait=gait,samples=samples,passed=len(samples)==60 and max(x['violation'] for x in samples)<1e-3,final_height=float(data.qpos[2]))
 reports.append(report);print(json.dumps({k:v for k,v in report.items() if k!='samples'}),flush=True)
(root/'results/closed-loop-native.json').write_text(json.dumps(reports,indent=2))
