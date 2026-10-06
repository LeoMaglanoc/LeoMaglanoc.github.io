"""Convert upstream collision primitives, link transforms and inertias to MJCF.

No visual meshes are redistributed. Joint reduction matches upstream (4 arm DoF).
"""
import sys, os, json
from pathlib import Path
import xml.etree.ElementTree as E
import numpy as np
from scipy.spatial.transform import Rotation
import mujoco as mj
import pinocchio as pin
sys.path.insert(0,'/opt/wb-mpc'); os.chdir('/opt/wb-mpc')
from utils.robot import B2_Z1
robot = B2_Z1(reference_pose='standing_with_arm_up',arm_joints=4)
controlled = list(robot.model.names)[2:]
pin.framesForwardKinematics(robot.model,robot.data,robot.q0)
# Native stance assumes zero foot velocity at the reference pose. Place the
# plane at the bottom of the preserved 32 mm foot spheres in that pose.
floor_height=float(np.mean([robot.data.oMf[robot.model.getFrameId(name)].translation[2]-.032 for name in ['FR_foot','FL_foot','RR_foot','RL_foot']]))
r = E.parse('robots/b2_z1_description/urdf/b2_z1.urdf').getroot()
links = {l.get('name'):l for l in r.findall('link')}
children = {}
for j in r.findall('joint'): children.setdefault(j.find('parent').get('link'),[]).append(j)
fmt = lambda v: ' '.join(f'{x:.12g}' for x in v)
vec = lambda el, key, default='0 0 0': np.fromstring(el.get(key,default) if el is not None else default,sep=' ')
def quat(origin):
    q=Rotation.from_euler('xyz',vec(origin,'rpy')).as_quat()
    return fmt(q[[3,0,1,2]])
root = E.Element('mujoco',model='B2_Z1_upstream_reduced')
E.SubElement(root,'compiler',angle='radian',inertiafromgeom='false',fusestatic='false')
E.SubElement(root,'option',timestep='0.002',gravity='0 0 -9.81',integrator='implicitfast')
world=E.SubElement(root,'worldbody')
E.SubElement(world,'geom',name='floor',type='plane',pos=f'0 0 {floor_height:.12g}',size='0 0 .1',rgba='.08 .13 .12 1',friction='.9 .005 .0001')
act=E.SubElement(root,'actuator')
def build(name,parent,joint=None):
    origin=joint.find('origin') if joint is not None else None
    body=E.SubElement(parent,'body',name=name,pos=fmt(vec(origin,'xyz')),quat=quat(origin))
    if joint is None:
        body.set('pos','0 0 .55'); E.SubElement(body,'freejoint',name='root_joint')
    elif joint.get('name') in controlled:
        lim=joint.find('limit'); jname=joint.get('name')
        E.SubElement(body,'joint',name=jname,type='hinge',axis=joint.find('axis').get('xyz'),range=f"{lim.get('lower')} {lim.get('upper')}",damping='0',armature='0')
        effort=lim.get('effort')
        E.SubElement(act,'motor',name=jname,joint=jname,ctrllimited='true',ctrlrange=f'-{effort} {effort}')
    link=links[name]
    # Use the exact reduced Pinocchio model's aggregated inertias. This folds
    # fixed children (including locked wrist links) into their moving ancestor.
    jid = 1 if joint is None else (robot.model.getJointId(joint.get('name')) if joint.get('name') in controlled else None)
    if jid is not None:
        inertia = robot.model.inertias[jid]
        tensor = inertia.inertia
        E.SubElement(body,'inertial',pos=fmt(inertia.lever),mass=str(inertia.mass),fullinertia=fmt([tensor[0,0],tensor[1,1],tensor[2,2],tensor[0,1],tensor[0,2],tensor[1,2]]))
    for idx,c in enumerate(link.findall('collision')):
        shape=list(c.find('geometry'))[0]; kind=shape.tag
        if kind == 'box': size=fmt(np.fromstring(shape.get('size'),sep=' ')/2)
        elif kind == 'sphere': size=shape.get('radius')
        elif kind == 'cylinder': size=f"{shape.get('radius')} {float(shape.get('length'))/2}"
        else: raise ValueError(f'Unsupported upstream collision {kind}')
        color='.67 .78 .76 1' if name.startswith(('FL','FR','RL','RR')) else '.30 .42 .40 1'
        if name.startswith('link') or name.startswith('gripper'): color='.74 .91 .35 1'
        E.SubElement(body,'geom',name=f'{name}_collision_{idx}',type=kind,size=size,pos=fmt(vec(c.find('origin'),'xyz')),quat=quat(c.find('origin')),group='1',rgba=color,friction='.9 .005 .0001')
    if name in ['FR_foot','FL_foot','RR_foot','RL_foot','gripperCenterLink']:
        E.SubElement(body,'site',name=name,size='.01')
    for child in children.get(name,[]): build(child.find('child').get('link'),body,child)
    return body
build('base_link',world)
out=Path('/workspace/projects/locomotion-playground/robots/b2z1'); out.mkdir(parents=True,exist_ok=True)
E.indent(root); (out/'scene.xml').write_text(E.tostring(root,encoding='unicode'))
model=mj.MjModel.from_xml_path(str(out/'scene.xml')); data=mj.MjData(model)
assert (model.nq,model.nv,model.nu)==(23,22,16)
order=[mj.mj_id2name(model,mj.mjtObj.mjOBJ_JOINT,i) for i in range(1,model.njnt)]
mapping=[]
for i,name in enumerate(controlled):
    j=mj.mj_name2id(model,mj.mjtObj.mjOBJ_JOINT,name); u=mj.mj_name2id(model,mj.mjtObj.mjOBJ_ACTUATOR,name)
    mapping.append(dict(name=name,pin_q=7+i,pin_v=6+i,mj_q=int(model.jnt_qposadr[j]),mj_v=int(model.jnt_dofadr[j]),actuator=u))
assert len(set(x['mj_q'] for x in mapping))==16
mapdata=dict(pinocchio_joint_order=controlled,mujoco_joint_order=order,mapping=mapping,q0=robot.q0.tolist(),floor_height=floor_height,feet=['FR_foot','FL_foot','RR_foot','RL_foot'])
(out/'joint-map.json').write_text(json.dumps(mapdata,indent=2))
# Verify FK and kinetic/inertia correspondence across nonzero configurations.
errors=[]; mass_errors=[]
for seed in range(5):
    q=robot.q0.copy(); q[7:]+=np.random.default_rng(seed).uniform(-.1,.1,16)
    data.qpos[:3]=q[:3]; data.qpos[3:7]=q[[6,3,4,5]]
    for x in mapping: data.qpos[x['mj_q']]=q[x['pin_q']]
    mj.mj_forward(model,data); pin.framesForwardKinematics(robot.model,robot.data,q)
    for name in mapdata['feet']+['gripperCenterLink']:
        frame=robot.model.getFrameId(name); body=mj.mj_name2id(model,mj.mjtObj.mjOBJ_BODY,name)
        errors.append(float(np.max(np.abs(robot.data.oMf[frame].translation-data.xpos[body]))))
    # Both libraries express joint mass blocks in the same coordinates.
    pin.crba(robot.model,robot.data,q); full=np.zeros((22,22)); mj.mj_fullM(model,full,data.qM)
    adr=[x['mj_v'] for x in mapping]
    mass_errors.append(float(np.max(np.abs(robot.data.M[6:,6:]-full[np.ix_(adr,adr)]))))
assert max(errors)<1e-8, errors
assert max(mass_errors)<1e-7, mass_errors
for _ in range(100): mj.mj_step(model,data)
assert np.isfinite(data.qpos).all()
report=dict(nq=model.nq,nv=model.nv,nu=model.nu,dt=model.opt.timestep,max_fk_error_m=max(errors),max_joint_mass_matrix_error=max(mass_errors),passive_steps=100,contact_count=int(data.ncon),mass=float(model.body_mass.sum()),floor_height=floor_height)
Path('/workspace/projects/locomotion-playground/results/model-validation.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report,indent=2))
