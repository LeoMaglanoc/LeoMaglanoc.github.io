"""Import a pinned upstream browser contract, preserving physics parameters."""
from pathlib import Path
import json, shutil, hashlib, subprocess, yaml, xml.etree.ElementTree as ET
R=Path('/work/projects/g1-loco-manipulation'); U=Path('/upstream/viewer'); V=U/'humanoid-policy-viewer-src'; S=V/'public/examples/scenes'
for name in ['carryBoxWTACPolicyRunner.js','omniPlanCarryBoxWTACO.js','utils/math.js']:
 dst=R/'src/upstream'/name; dst.parent.mkdir(parents=True,exist_ok=True); shutil.copyfile(V/'src/simulation'/name,dst)
p=R/'src/upstream/carryBoxWTACPolicyRunner.js'; p.write_text(p.read_text().replace("from 'onnxruntime-web'", "from '../../ort.js'"))
(R/'robots/meshes').mkdir(parents=True,exist_ok=True)
for mesh in (R/'robots/meshes').glob('*'): mesh.unlink()
robot=ET.parse('/upstream/native/g1_description/g1_29dof.xml')
for mesh in robot.findall('asset/mesh'):
 shutil.copyfile(Path('/upstream/native/g1_description/meshes')/mesh.get('file'),R/'robots/meshes'/mesh.get('file'))
robot.find('option').set('timestep','0.005')
robot.write(R/'robots/robot.xml',encoding='unicode')
for task,file in [('carrybox','carrybox_manager_carry.xml'),('pushbox','omniplan2track_push_box.xml')]:
 tree=ET.parse(Path('/upstream/native/g1_description')/('omnicontact_carry_box.xml' if task=='carrybox' else 'omnicontact_push_box.xml')); root=tree.getroot(); root.find('include').set('file','robot.xml')

 for inc in list(root.findall('include'))[1:]: root.remove(inc)
 world=root.find('worldbody')
 for child in list(world):
  if child.tag=='include' or child.get('name','').startswith(('ghost','ref_')): world.remove(child)
 # This unused decorative resource is not part of the contact model.
 for mesh in root.findall('asset/mesh'):
  if mesh.get('file','').startswith('../objects'): root.find('asset').remove(mesh)
 tree.write(R/'robots'/f'{task}.xml',encoding='unicode')
config=json.loads((V/'public/examples/checkpoints/g1/omnicontact_policy.json').read_text()); config['onnx']['path']='./policy.onnx'; config['goal_pos']=[2,0.5,0.55]
native=yaml.safe_load(Path('/upstream/native/policy/omnicontact/config/OmniContact.yaml').read_text())
runner=yaml.safe_load(Path('/upstream/native/deploy_omnicontact/config/mujoco.yaml').read_text())
config['stiffness']=[native['kp_lab'][i] for i in config['lab2mj']]
config['damping']=[native['kd_lab'][i] for i in config['lab2mj']]
config['torque_limits']=[runner['torque_limit_lab'][i] for i in config['lab2mj']]
(R/'config.json').write_text(json.dumps(config,indent=2))
shutil.copyfile(Path('/upstream/native/policy/omnicontact/model/omnicontact_transformer.onnx'),R/'policy.onnx')
files=[p.relative_to(R).as_posix() for p in (R/'robots').rglob('*') if p.is_file()]
(R/'asset-manifest.json').write_text(json.dumps(files,indent=2))
provenance={'viewer_revision':'8daf3d331eff1952555f95b7c044049f61d0dd39','native_revision':'1cf9ddd4067cbe5710b1f475e96f9c69f88055e2','sha256':{}}
for p in [R/'policy.onnx',*Path('/upstream/native/policy/omnicontact/model').glob('*.onnx')]: provenance['sha256'][p.name]=hashlib.sha256(p.read_bytes()).hexdigest()
(R/'provenance.json').write_text(json.dumps(provenance,indent=2))
