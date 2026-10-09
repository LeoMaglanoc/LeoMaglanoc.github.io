"""Reproduce released CPU runners, freezing inputs and physics evidence."""
import sys, json, time, hashlib, os
from pathlib import Path
import numpy as np
import mujoco
ROOT=Path('/work/projects/g1-loco-manipulation')
UP=Path('/upstream/native')
sys.path[:0]=[str(UP),str(UP/'deploy_omnicontact')]
from omnicontact_runner_args import parse_args
from run_skill_omnicontact import OmniContactRunner
results=[]
for model in ['omnicontact_transformer.onnx','omnicontact_mlp.onnx']:
 for task in ['carrybox','pushbox']:
  sys.argv=['native','--headless','--task',task,'--policy',model,'--init-pos','1','0','0.55','--goal-pos','2','0.5','0.55','--disable-replan','--seed','0']
  r=OmniContactRunner(parse_args()); r.m.opt.disableflags |= 0 if os.getenv('LOCO_UPSTREAM') else int(mujoco.mjtDisableBit.mjDSBL_MULTICCD); r._prepare_episode()
  original=r.policy.ort_session
  fixtures=[]
  class Capture:
   def run(self, names, feeds):
    out=original.run(names,feeds)
    if len(fixtures)<10: fixtures.append({'obs':feeds['obs'].reshape(-1).tolist(),'actions':out[0].reshape(-1).tolist(),'qpos':np.concatenate([r.d.qpos[:36],r.d.qpos[r.m.jnt_qposadr[r.m.joint('box').id]:r.m.jnt_qposadr[r.m.joint('box').id]+(15 if task=='pushbox' else 7)]]).tolist(),'qvel':np.concatenate([r.d.qvel[:35],r.d.qvel[r.m.jnt_dofadr[r.m.joint('box').id]:r.m.jnt_dofadr[r.m.joint('box').id]+(14 if task=='pushbox' else 6)]]).tolist(),'warmstart':np.concatenate([r.d.qacc_warmstart[:35],r.d.qacc_warmstart[r.m.jnt_dofadr[r.m.joint('box').id]:r.m.jnt_dofadr[r.m.joint('box').id]+(14 if task=='pushbox' else 6)]]).tolist(),'mocap':r.d.mocap_pos.tolist(),'objectPos':r.d.xpos[r.m.body('box').id].tolist(),'objectQuat':r.d.xquat[r.m.body('box').id].tolist()})
    return out
  r.policy.ort_session=Capture()
  refs={name:getattr(r.policy,name).tolist() for name in ['ref_left_wrist_pos','ref_left_wrist_quat','ref_right_wrist_pos','ref_right_wrist_quat','ref_torso_future_pos','ref_torso_future_quat','ref_left_ankle_future_pos','ref_left_ankle_future_quat','ref_right_ankle_future_pos','ref_right_ankle_future_quat','ref_contact']}
  timings=[]; trace=[]
  for tick in range(1200):
   t=time.perf_counter(); r._run_policy_tick(); timings.append((time.perf_counter()-t)*1000)
   r._handle_policy_tick_postprocess()
   if tick%50==0: trace.append({'tick':tick,'qpos':r.d.qpos.tolist()})
   for _ in range(r.control_decimation):
    r.d.ctrl[:]=r._pd_control(); mujoco.mj_step(r.m,r.d); r.sim_counter+=1
   if bool(getattr(r.policy_output,'switch_to_loco',False)): break
  result={'model':model,'task':task,'ticks':tick+1,'success':str(getattr(r.policy_output,'success','')),'final_object_position':r.d.xpos[r.m.body('box').id].tolist(),'mean_tick_ms':float(np.mean(timings)),'p95_tick_ms':float(np.percentile(timings,95)),'final_qpos':r.d.qpos.tolist(),'trace':trace,'metrics':r._collect_episode_metrics()}
  results.append(result)
  if 'transformer' in model and not os.getenv('LOCO_UPSTREAM'): (ROOT/('fixture-'+task+'.json')).write_text(json.dumps({'refs':refs,'frames':fixtures}))
  (ROOT/('results/native-upstream.json' if os.getenv('LOCO_UPSTREAM') else 'results/native.json')).write_text(json.dumps(results,indent=2,default=lambda x:np.asarray(x).tolist()))
  print(json.dumps({k:v for k,v in result.items() if k not in ['trace','final_qpos','metrics']}),flush=True)
