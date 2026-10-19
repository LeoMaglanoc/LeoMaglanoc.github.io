"""Inspect the untouched ZIP scene. Runs without a display or rendering libraries."""
import sys,json,hashlib,platform
from pathlib import Path
import mujoco as mj
import numpy as np
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tools'))
from build_scene import build
scene=build(ROOT/'upstream/yam.xml')
# Compile with assets relative to the XML; preserve untouched output separately.
(ROOT/'scene/zip_baseline.xml').write_bytes(scene.read_bytes());scene.unlink()
m=mj.MjModel.from_xml_path(str(ROOT/'scene/zip_baseline.xml'));d=mj.MjData(m)
for side in ['left','right']:
 for i,q in enumerate([0,1.047,1.047,0,0,0]):
  d.qpos[m.joint(f'{side}_joint{i+1}').qposadr]=q;d.ctrl[m.actuator(f'{side}_joint{i+1}').id]=q
mj.mj_forward(m,d)
report=dict(mujoco=mj.__version__,python=platform.python_version(),nbody=m.nbody,njnt=m.njnt,nu=m.nu,ncam=m.ncam,dt=m.opt.timestep,table_top=.730,source_sha256=hashlib.sha256((ROOT/'upstream/yam.xml').read_bytes()).hexdigest(),arms={})
for side in ['left','right']:
 sid=m.site(side+'_grasp_site').id
 report['arms'][side]=dict(base=m.body(side+'_arm').pos.tolist(),base_quat=m.body(side+'_arm').quat.tolist(),home_grasp_position=d.site_xpos[sid].tolist(),home_grasp_rotation=d.site_xmat[sid].reshape(3,3).tolist(),actuators=[dict(name=f'{side}_'+name,id=m.actuator(f'{side}_'+name).id,range=m.actuator(f'{side}_'+name).ctrlrange.tolist()) for name in ['joint1','joint2','joint3','joint4','joint5','joint6','gripper']])
for _ in range(2000):mj.mj_step(m,d)
report['settled']={o:d.xpos[m.body(o).id].tolist() for o in ['cube','cylinder']}
assert m.nu==14 and m.ncam==5
assert .75<report['settled']['cube'][2]<.78
(ROOT/'results/baseline.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
