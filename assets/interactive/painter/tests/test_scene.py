"""Native MuJoCo scene validation. Run with a Python environment containing mujoco."""
from pathlib import Path
import unittest
import mujoco
import numpy as np
ROOT = Path(__file__).resolve().parents[1]
class SceneTests(unittest.TestCase):
    def test_scene_contract(self):
        model = mujoco.MjModel.from_xml_path(str(ROOT / 'robots/panda/scene.xml'))
        self.assertEqual((model.nq, model.nv, model.nu), (9, 9, 8))
        for name, kind in [('marker_tip', mujoco.mjtObj.mjOBJ_SITE), ('canvas', mujoco.mjtObj.mjOBJ_GEOM), ('home', mujoco.mjtObj.mjOBJ_KEY)]:
            self.assertGreaterEqual(mujoco.mj_name2id(model,kind,name),0)
        for j in range(1,8):
            self.assertGreaterEqual(mujoco.mj_name2id(model,mujoco.mjtObj.mjOBJ_JOINT,f'joint{j}'),0)
        data=mujoco.MjData(model)
        mujoco.mj_resetDataKeyframe(model,data,0)
        for _ in range(500): mujoco.mj_step(model,data)
        self.assertTrue(np.isfinite(data.qpos).all())
if __name__ == '__main__': unittest.main()
