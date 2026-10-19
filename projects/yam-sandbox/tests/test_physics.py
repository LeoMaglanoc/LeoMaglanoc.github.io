import sys,json,hashlib,ast,inspect,unittest
from pathlib import Path
import numpy as np
import mujoco as mj
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tools'))
from native_pick_place import Simulation
from generate_references import ik,init,m
class Physics(unittest.TestCase):
 def test_contract_and_reference_frames(self):
  self.assertEqual((m.nu,m.ncam),(14,5));self.assertAlmostEqual(m.opt.timestep,.002)
  digest=hashlib.sha256((ROOT/'scene/bimanual_scene.xml').read_bytes()).hexdigest()
  for obj in ['cube','cylinder']:
   ref=json.loads((ROOT/'references'/f'{obj}.json').read_text());self.assertEqual(ref['scene_sha256'],digest)
   side=ref['side'];qa=[m.joint(f'{side}_joint{i+1}').qposadr[0] for i in range(6)];d=init()
   for w in ref['waypoints']:
    for q in w['qs']:
     d.qpos[qa]=q;mj.mj_forward(m,d)
     for i,v in enumerate(q):self.assertTrue(m.actuator(f'{side}_joint{i+1}').ctrlrange[0]<v<m.actuator(f'{side}_joint{i+1}').ctrlrange[1])
     for c in d.contact:
      ids=[int(c.geom1),int(c.geom2)]
      if m.geom('tabletop').id in ids and any(m.geom_group[g]==3 for g in ids):self.assertGreater(c.dist,-.001)
   sid=m.site(side+'_grasp_site').id;d.qpos[qa]=ref['waypoints'][1]['q'];mj.mj_forward(m,d)
   pos=d.site_xpos[sid].copy();q=ik(side,pos,ref['waypoints'][1]['q']);d.qpos[qa]=q;mj.mj_forward(m,d)
   np.testing.assert_allclose(d.site_xpos[sid],pos,atol=1e-5)
 def test_finger_gap_direction(self):
  d=init();side='left';lf=m.body('left_lf_down').id;rf=m.body('left_rf_down').id
  boxes=[g for g in range(m.ngeom) if m.geom_type[g]==6 and m.geom_bodyid[g] in [lf,rf] and abs(m.geom_size[g,0]-.006)<1e-6]
  self.assertEqual(len(boxes),4)
  gaps=[]
  for q in [0,.02,.0375]:
   d.qpos[m.joint('left_left_finger').qposadr]=q;d.qpos[m.joint('left_right_finger').qposadr]=-q;mj.mj_forward(m,d)
   a=[g for g in boxes if m.geom_bodyid[g]==lf][0];b=[g for g in boxes if m.geom_bodyid[g]==rf][0]
   gaps.append(np.linalg.norm(d.geom_xpos[a]-d.geom_xpos[b])-.004)
  np.testing.assert_allclose(gaps,[.0008,.0408,.0758],atol=1e-5)
 def test_no_pose_writes_in_live_controller(self):
  tree=ast.parse(inspect.getsource(__import__('native_pick_place')))
  for fn in ast.walk(tree):
   if isinstance(fn,ast.FunctionDef) and fn.name not in ['__init__']:
    for n in ast.walk(fn):
     if isinstance(n,ast.Subscript) and isinstance(n.ctx,ast.Store):self.assertNotEqual(getattr(n.value,'attr',''),'qpos')
 def test_lost_grasp_reports_failure(self):
  s=Simulation('cube')
  while s.phase not in ['TRANSFER','FAILED']:s.tick()
  self.assertEqual(s.phase,'TRANSFER');self.assertTrue(s.grasped)
  for i in range(s.m.ngeom):
   if s.m.geom_bodyid[i]==s.ob:s.m.geom_contype[i]=0;s.m.geom_conaffinity[i]=0
  while s.phase not in ['DONE','FAILED']:s.tick()
  self.assertEqual(s.phase,'FAILED');self.assertIn('Lost finger contact',s.reason)
if __name__=='__main__':unittest.main()
