"""Fast, containerized checks for the shipped native model and ONNX contract."""

from pathlib import Path
import unittest

import mujoco
import numpy as np
import onnxruntime as ort


ROOT = Path(__file__).resolve().parents[1]


class ContractTests(unittest.TestCase):
    def test_g1_model_contract(self):
        model = mujoco.MjModel.from_xml_path(str(ROOT / "robots/g1/scene.xml"))
        self.assertEqual((model.nq, model.nv, model.nu), (19, 18, 12))
        self.assertEqual(model.opt.timestep, 0.002)


    def test_onnx_policy_contract(self):
        session = ort.InferenceSession(str(ROOT / "models/policy.onnx"), providers=["CPUExecutionProvider"])
        self.assertEqual([item.name for item in session.get_inputs()], ["obs", "hidden", "cell"])
        self.assertEqual([item.name for item in session.get_outputs()], ["action", "next_hidden", "next_cell"])
        outputs = session.run(
            None,
            {
                "obs": np.zeros((1, 47), dtype=np.float32),
                "hidden": np.zeros((1, 1, 64), dtype=np.float32),
                "cell": np.zeros((1, 1, 64), dtype=np.float32),
            },
        )
        self.assertEqual(
            [output.shape for output in outputs], [(1, 12), (1, 1, 64), (1, 1, 64)]
        )


if __name__ == "__main__":
    unittest.main()
