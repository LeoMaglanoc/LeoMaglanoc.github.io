"""CPU adapter for the unmodified upstream native evaluation scene (no GPU training imports)."""
import importlib.util, sys, types, json, shutil, hashlib
from pathlib import Path
import numpy as np
import mujoco, onnxruntime as ort
ROOT=Path('/work')
P=ROOT/'projects/dexterous-rl'
UP=P/'vendor/wuji-mjlab/src/wuji_mjlab'
OUT=P/'web'
OUT.mkdir(parents=True,exist_ok=True)
def load(name,path):
 s=importlib.util.spec_from_file_location(name,path); m=importlib.util.module_from_spec(s); sys.modules[name]=m; s.loader.exec_module(m); return m
sb=load('scene_builder',UP/'tasks/reorient/tooling/scene_builder.py')
robot=load('robot_cfg',UP/'assets/robots/wuji_hand/wuji_hand_cfg.py')
obj=load('wuji_mjlab.assets.objects.inhand_object.object_cfg',UP/'assets/objects/inhand_object/object_cfg.py')
cfg=json.loads((P/'checkpoints/released/config.json').read_text())
from types import SimpleNamespace as NS
def robot_spec():
 s=robot._get_spec(robot.wuji_hand_xml_path())
 s.body('right_palm_link').add_site(name='right_wrist_tag',pos=(.0262,0,-.0563),quat=(.70710678,0,.70710678,0),size=(.0252,.0252,.0006),type=mujoco.mjtGeom.mjGEOM_BOX,group=1)
 return s
home=NS(pos=(0,0,.5),rot=(.70710678,0,-.70710678,0),joint_pos=dict(zip(cfg['joint_order'],cfg['default_joint_pos'])))
cube=NS(pos=(-.0967,.0100,.5599),rot=(1,0,0,0))
sb._resolve_hand_profile=lambda *args:(NS(spec_fn=robot_spec),home,cube)
obj.get_inhand_object_cfg=lambda edge_m=None:NS(spec_fn=lambda:obj._get_spec(edge_m))
# Capture composed MjSpec before compilation; upstream file stays unmodified.
code=(UP/'tasks/reorient/tooling/scene_builder.py').read_text().replace('  model = spec.compile()', '  globals()["composed_spec"] = spec\n  model = spec.compile()')
exec(compile(code, 'upstream-scene-builder', 'exec'), sb.__dict__)
sb._resolve_hand_profile=lambda *args:(NS(spec_fn=robot_spec),home,cube)
scene=sb.build_reorient_scene()
m,d=scene.model,scene.data
# Use the upstream ObsBuilder directly, loading just its AST to avoid GPU package discovery.
import ast
source=ast.parse((UP/'tasks/reorient/tooling/eval_core.py').read_text())
klass=next(n for n in source.body if isinstance(n,ast.ClassDef) and n.name=='ObsBuilder')
from collections import deque
scope=dict(vars(sb)); scope.update(deque=deque)
exec(compile(ast.Module(body=[klass],type_ignores=[]),'upstream-ObsBuilder','exec'),scope)
ObsBuilder=scope['ObsBuilder']
# Canonical composed XML and original mesh bytes; scene_builder uses the official assets unchanged.
(OUT/'scene.xml').write_text(sb.composed_spec.to_xml())
import xml.etree.ElementTree as ET
xml=ET.parse(OUT/'scene.xml'); root=xml.getroot(); comp=root.find('compiler'); comp.set('meshdir','meshes'); comp.set('texturedir','textures')
(OUT/'meshes').mkdir(exist_ok=True); (OUT/'textures').mkdir(exist_ok=True)
for mesh in root.findall('./asset/mesh'):
 name=Path(mesh.get('file')).name
 matches=list((UP/'assets').rglob(name)); assert matches,name
 shutil.copyfile(matches[0],OUT/'meshes'/name); mesh.set('file',name)
for tex in root.findall('./asset/texture'):
 for attr in ['file','fileup','filedown','fileleft','fileright','filefront','fileback']:
  if tex.get(attr):
   name=Path(tex.get(attr)).name; matches=list((UP/'assets').rglob(name)); assert matches,name
   shutil.copyfile(matches[0],OUT/'textures'/name); tex.set(attr,name)
xml.write(OUT/'scene.xml')
shutil.copyfile(P/'checkpoints/released/policy.onnx',OUT/'policy.onnx')
meta=dict(cfg,sim_dt=scene.sim_dt,n_substeps=scene.n_substeps,qadr=scene.joint_qpos_adr.tolist(),ctrl_ids=scene.ctrl_ids.tolist(),cube_qadr=int(scene.cube_qpos_adr),cube_body=int(scene.cube_body_id),palm_body=int(scene.palm_body_id),tag_site=int(scene.tag_site_id),soft_lower=scene.soft_lower.tolist(),soft_upper=scene.soft_upper.tolist(),initial_qpos=d.qpos.tolist(),initial_ctrl=d.ctrl.tolist())
(OUT/'config.json').write_text(json.dumps(meta,indent=2))
session=ort.InferenceSession(str(OUT/'policy.onnx'),providers=['CPUExecutionProvider'])
print('Actor',session.get_inputs()[0].shape,session.get_outputs()[0].shape,flush=True)
vectors=[]; trials=[]; rng=np.random.default_rng(42)
for trial in range(12):
 sb.reset_scene(scene); obs=ObsBuilder(3); target=scene.default_joint_pos.copy(); action=np.zeros(20,dtype=np.float32)
 goal=rng.normal(size=4); goal/=np.linalg.norm(goal); errors=[]
 for step in range(280):
  o=obs.build(scene,target,goal,action)
  action=session.run(None,{session.get_inputs()[0].name:o[None]})[0][0]
  vector=None
  if trial<2 and step in [0,1,8,40,100]:
   vector=dict(qvel=d.qvel.tolist(),warmstart=d.qacc_warmstart.tolist(),histories=[[frame.tolist() for frame in buf] for buf in obs._buffers.values()],qpos=d.qpos.tolist(),site_xpos=d.site_xpos[scene.tag_site_id].tolist(),site_xmat=d.site_xmat[scene.tag_site_id].tolist(),prev_target=target.tolist(),goal=goal.tolist(),last_action=(obs._buffers['action_history'][-1]).tolist(),observation=o.tolist(),action=action.tolist(),step=step,trial=trial)
   vectors.append(vector)
  target=sb.apply_action(scene,action,target,step)
  for _ in range(scene.n_substeps): mujoco.mj_step(m,d)
  if vector is not None: vector.update(next_qpos=d.qpos.tolist(),next_qvel=d.qvel.tolist(),target=target.tolist())
  errors.append(float(sb.quat_error_magnitude(scene.cube_quat,goal)*180/np.pi))
  if trial==0 and step==60:
   renderer=mujoco.Renderer(m,height=480,width=640)
   cam=mujoco.MjvCamera(); cam.lookat[:]=[-.06,0,.54]; cam.distance=.48; cam.azimuth=130; cam.elevation=-15
   opt=mujoco.MjvOption(); opt.geomgroup[3:]=0
   renderer.update_scene(d,camera=cam,scene_option=opt)
   from PIL import Image
   Image.fromarray(renderer.render()).save(P/'results/native-visual.png')
   opt.geomgroup[:]=0; opt.geomgroup[3]=1
   renderer.update_scene(d,camera=cam,scene_option=opt)
   Image.fromarray(renderer.render()).save(P/'results/native-collision.png'); renderer.close()
 trials.append(dict(goal=goal.tolist(),seed=42,trial=trial,initial_error=errors[0],min_error=min(errors),final_error=errors[-1],cube_z=float(scene.cube_pos[2])))
 print(trials[-1],flush=True)
(OUT/'golden.json').write_text(json.dumps(vectors))
(P/'results/native-evaluation.json').write_text(json.dumps(trials,indent=2))
files=['scene.xml','config.json','policy.onnx']+[str(f.relative_to(OUT)) for sub in ['meshes','textures'] for f in (OUT/sub).iterdir()]
(OUT/'manifest.json').write_text(json.dumps(files,indent=2))
(P/'checkpoints/released/SHA256SUMS').write_text('\n'.join(hashlib.sha256(f.read_bytes()).hexdigest()+'  '+f.name for f in (P/'checkpoints/released').iterdir() if f.is_file() and f.name!='SHA256SUMS')+'\n')
