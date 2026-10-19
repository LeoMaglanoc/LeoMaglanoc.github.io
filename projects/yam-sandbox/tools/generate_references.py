import mujoco as mj, numpy as np, json
from scipy.optimize import least_squares
import hashlib
from scipy.spatial.transform import Rotation
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
m=mj.MjModel.from_xml_path(str(ROOT/'scene/bimanual_scene.xml'))
home=np.array([0,1.047,1.047,0,0,0.])
def init():
 d=mj.MjData(m)
 for side in ['left','right']:
  for i,q in enumerate(home):
   d.qpos[m.joint(f'{side}_joint{i+1}').qposadr]=q
   d.ctrl[m.actuator(f'{side}_joint{i+1}').id]=q
  d.qpos[m.joint(side+'_left_finger').qposadr]=.0375
  d.qpos[m.joint(side+'_right_finger').qposadr]=-.0375
  d.ctrl[m.actuator(side+'_gripper').id]=.0375
 mj.mj_forward(m,d)
 return d
def ik(side,pos,seed=home):
 d=init(); qa=np.array([m.joint(f'{side}_joint{i+1}').qposadr[0] for i in range(6)])
 bounds=np.array([m.joint(f'{side}_joint{i+1}').range for i in range(6)])
 sid=m.site(side+'_grasp_site').id
 R=np.array([[0,1,0],[1,0,0],[0,0,-1]]) if side=='left' else np.diag([1,-1,-1])
 # Explore symmetry-equivalent downward grasp orientations.
 def fun(q):
  d.qpos[qa]=q; mj.mj_forward(m,d)
  return np.r_[d.site_xpos[sid]-pos, .2*Rotation.from_matrix(R@d.site_xmat[sid].reshape(3,3).T).as_rotvec()]
 r=least_squares(fun,np.clip(seed,bounds[:,0]+.001,bounds[:,1]-.001),bounds=(bounds[:,0]+.001,bounds[:,1]-.001),gtol=1e-11,ftol=1e-11,xtol=1e-11,max_nfev=500)
 if np.linalg.norm(fun(r.x))>.001:
  best=r
  for yaw in [0,np.pi/2,np.pi,3*np.pi/2]:
   R=Rotation.from_rotvec([0,0,yaw]).as_matrix()@np.diag([1,-1,-1])
   for trial in range(4):
    rng=np.random.default_rng(trial)
    guess=seed if trial==0 else rng.uniform(bounds[:,0]+.01,bounds[:,1]-.01)
    r=least_squares(fun,np.clip(guess,bounds[:,0]+.001,bounds[:,1]-.001),bounds=(bounds[:,0]+.001,bounds[:,1]-.001),gtol=1e-10,ftol=1e-10,xtol=1e-10,max_nfev=300)
    if np.linalg.norm(fun(r.x))<.001: return r.x
  raise ValueError((side,pos,r.x,fun(r.x)))
 return r.x
if __name__=='__main__':
 for side,obj,start,goal in [('left','cube',[-.10,-.10],[ -.22,-.22]),('right','cylinder',[.08,.07],[.22,-.18])]:
  q=home.copy(); refs=[]
  for phase,p,z,grip in [('APPROACH',start,.88,.0375),('DESCEND',start,.749,.0375),('CLOSE',start,.749,0),('LIFT',start,.85,0),('TRANSFER',goal,.85,0),('LOWER',goal,.753,0),('RELEASE',goal,.753,.0375),('RETREAT',goal,.88,.0375)]:
   target=np.array([*p,z]); qs=[q.tolist()]
   if refs:
    for u in np.linspace(0,1,25)[1:]:
     q=ik(side,previous+u*(target-previous),q);qs.append(q.tolist())
   else:
    q=ik(side,target,q);qs.append(q.tolist())
   refs.append(dict(phase=phase,q=q.tolist(),qs=qs,grip=grip));previous=target;print(side,phase,np.round(q,3))
  (ROOT/'references'/f'{obj}.json').write_text(json.dumps(dict(side=side,object=obj,goal=goal,home=home.tolist(),scene_sha256=hashlib.sha256((ROOT/'scene/bimanual_scene.xml').read_bytes()).hexdigest(),tool_sha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),waypoints=refs),indent=2)+'\n')
