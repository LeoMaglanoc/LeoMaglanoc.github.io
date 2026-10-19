"""Save complete MuJoCo integration + controller state; resume with --resume FILE."""
import json,hashlib,sys
import mujoco as mj
import numpy as np
from native_pick_place import Simulation,ROOT
SPEC=mj.mjtState.mjSTATE_INTEGRATION
FIELDS=['index','phase','start','fromg','lift_dwell','place_dwell','lost','grasped','reason','max_lift','base']
def save(s,path):
 state=np.empty(mj.mj_stateSize(s.m,SPEC));mj.mj_getState(s.m,s.d,state,SPEC)
 snapshot=dict(format=1,mujoco=mj.__version__,object=s.obj,scene_sha256=s.ref['scene_sha256'],reference_sha256=hashlib.sha256((ROOT/'references'/f'{s.obj}.json').read_bytes()).hexdigest(),controller_sha256=hashlib.sha256((ROOT/'tools/native_pick_place.py').read_bytes()).hexdigest(),state_spec=int(SPEC),integration_state=state.tolist(),controller={k:getattr(s,k) for k in FIELDS},trace=s.trace,samples=s.samples)
 path.write_text(json.dumps(snapshot,indent=2)+'\n')
def restore(path):
 v=json.loads(path.read_text());s=Simulation(v['object'])
 assert v['mujoco']==mj.__version__ and v['scene_sha256']==s.ref['scene_sha256']
 assert v['reference_sha256']==hashlib.sha256((ROOT/'references'/f'{s.obj}.json').read_bytes()).hexdigest()
 assert v['controller_sha256']==hashlib.sha256((ROOT/'tools/native_pick_place.py').read_bytes()).hexdigest()
 mj.mj_setState(s.m,s.d,np.array(v['integration_state']),SPEC);mj.mj_forward(s.m,s.d)
 for k,val in v['controller'].items():setattr(s,k,val)
 s.trace=v['trace'];s.samples=v['samples'];return s
if __name__=='__main__':
 if len(sys.argv)>1:
  s=restore(ROOT/sys.argv[1]);result=s.run();print(json.dumps(dict(success=result['success'],reason=result['reason'],final=result['trace'][-1]),indent=2));assert result['success']
 else:
  for obj in ['cube','cylinder']:
   s=Simulation(obj);save(s,ROOT/'checkpoints'/f'{obj}-ready.json');saved=False
   while s.phase not in ['DONE','FAILED']:
    s.tick()
    if s.phase=='TRANSFER' and not saved:save(s,ROOT/'checkpoints'/f'{obj}-lifted.json');saved=True
   assert s.phase=='DONE';save(s,ROOT/'checkpoints'/f'{obj}-placed.json')
