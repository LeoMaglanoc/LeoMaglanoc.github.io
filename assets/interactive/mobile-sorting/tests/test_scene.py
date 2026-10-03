import unittest
import mujoco
import numpy as np

class SceneTests(unittest.TestCase):
    def test_native_model_and_collision_contract(self):
        m=mujoco.MjModel.from_xml_path('robots/tiago/scene.xml')
        self.assertEqual((m.nq,m.nv,m.nu,m.neq),(53,47,11,0))
        self.assertEqual(m.opt.timestep,.002)
        for side in ['left','right']:
            g=m.geom(f'gripper_{side}_finger_link_pad')
            self.assertEqual(int(g.type[0]),mujoco.mjtGeom.mjGEOM_BOX)
            self.assertGreater(g.friction[0],1)
        d=mujoco.MjData(m)
        # Isolate the robot; parked free objects have collisions disabled.
        for i in range(5):
            j=m.joint(f'object_joint_{i}');a=int(j.qposadr[0]);d.qpos[a:a+3]=[3,3,-2-i]
            g=m.geom(f'object_geom_{i}');m.geom_contype[g.id]=0;m.geom_conaffinity[g.id]=0
        q=[.474584,1.08883,-1.651144,2.156559,1.030253,-1.091965,.834703]
        for i in range(7):d.qpos[m.joint(f'arm_{i+1}_joint').qposadr[0]]=q[i];d.ctrl[m.actuator(f'arm_{i+1}').id]=q[i]
        for _ in range(500):mujoco.mj_step(m,d)
        self.assertTrue(np.isfinite(d.qpos).all())

if __name__=='__main__':unittest.main()
