"""Fast, containerized checks for the shipped native model and ONNX contract."""

from pathlib import Path
import xml.etree.ElementTree as ET
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

    def test_terrain_playground_contract(self):
        scene_path = ROOT / "robots/g1/scene.xml"
        scene_root = ET.parse(scene_path).getroot()
        terrain = [
            geom
            for geom in scene_root.findall("./worldbody/geom")
            if geom.get("name", "").startswith("terrain_")
        ]

        self.assertEqual(len(terrain), 19)
        self.assertEqual(
            {geom.get("type") for geom in terrain},
            {"box"},
        )
        self.assertTrue(all(geom.get("group") == "1" for geom in terrain))
        self.assertTrue(
            all(geom.get("contype", "1") != "0" and geom.get("conaffinity", "1") != "0" for geom in terrain)
        )

        materials = {geom.get("material") for geom in terrain}
        self.assertEqual(materials, {"terrain-cobbles", "terrain-ramp", "terrain-steps"})

        cobbles = [geom for geom in terrain if geom.get("name", "").startswith("terrain_cobble_")]
        self.assertEqual(len(cobbles), 12)
        cobble_tops = [float(geom.get("pos").split()[2]) + float(geom.get("size").split()[2]) for geom in cobbles]
        self.assertGreaterEqual(min(cobble_tops), 0.01)
        self.assertLessEqual(max(cobble_tops), 0.04)

        ramp_top = next(geom for geom in terrain if geom.get("name") == "terrain_ramp_top")
        ramp_height = float(ramp_top.get("pos").split()[2]) + float(ramp_top.get("size").split()[2])
        self.assertGreaterEqual(ramp_height, 0.15)
        self.assertLessEqual(ramp_height, 0.25)

        # The first step starts beyond the 2 m x 2 m spawn zone (-1..1 m).
        first_step = next(geom for geom in terrain if geom.get("name") == "terrain_step_01")
        first_step_x = float(first_step.get("pos").split()[0])
        first_step_half_x = float(first_step.get("size").split()[0])
        self.assertGreaterEqual(first_step_x - first_step_half_x, 1.0)

    def test_fullscreen_route_contract(self):
        page = (ROOT.parents[2] / "_pages/g1.md").read_text()
        layout = (ROOT.parents[2] / "_layouts/g1-fullscreen.html").read_text()
        self.assertIn("layout: g1-fullscreen", page)
        self.assertIn("class=\"g1-frame\"", page)
        self.assertNotIn("loading=\"lazy\"", page)
        self.assertIn("height: 100dvh", layout)
        self.assertIn("overflow: hidden", layout)
        self.assertIn("allowfullscreen", page)


if __name__ == "__main__":
    unittest.main()
