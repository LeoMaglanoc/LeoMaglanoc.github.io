from __future__ import annotations

import sys
from pathlib import Path
import tempfile
import unittest
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
from build_scene import build  # noqa: E402

# Minimal stand-in for upstream source layout; exercises the builder offline.
# The production model (and physics) are ONLY tested once fetch_yam.py succeeds.
FAKE_YAM = """<mujoco model="test yam">
  <compiler meshdir="assets"/>
  <option integrator="implicitfast"/>
  <default><default class="yam"><joint damping="1"/></default></default>
  <asset><material name="black" rgba="0 0 0 1"/></asset>
  <worldbody>
    <body name="arm" childclass="yam">
      <joint name="joint1"/><geom name="base" type="sphere" size=".1"/>
      <body name="link_6"><joint name="joint2"/>
        <site name="grasp_site" pos="0 0 .1"/>
        <body name="finger"><joint name="left_finger"/>
          <joint name="right_finger"/>
        </body>
      </body>
    </body>
  </worldbody>
  <equality><joint joint1="left_finger" joint2="right_finger" polycoef="0 -1 0 0 0"/></equality>
  <actuator><position name="joint1" joint="joint1"/><position name="joint2" joint="joint2"/>
  <position name="gripper" joint="left_finger"/></actuator>
</mujoco>"""


class SceneStructure(unittest.TestCase):
    def test_bimanual_scene_valid_and_names_unique(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "yam.xml"
            path.write_text(FAKE_YAM)
            scene = build(path)
            root = ET.parse(scene).getroot()
            self.assertEqual(root.get("model"), "Dream-inspired bimanual YAM sandbox")
            bodies = [x.get("name") for x in root.iter("body") if x.get("name")]
            joints = [x.get("name") for x in root.iter("joint") if x.get("name")]
            actuators = list(root.find("actuator"))
            self.assertEqual(len(actuators), 6)
            self.assertEqual(len(list(root.find("equality"))), 2)
            self.assertEqual(len([b for b in bodies if b.endswith("_arm")]), 2)
            self.assertEqual(len(joints), len(set(joints)))
            self.assertEqual(len(bodies), len(set(bodies)))
            self.assertIn("left_grasp_site", [s.get("name") for s in root.iter("site")])
            self.assertIn("right_grasp_site", [s.get("name") for s in root.iter("site")])
            self.assertEqual(len(list(root.iter("camera"))), 5)
            for act in actuators:
                self.assertTrue(act.get("joint", "").startswith(("left_", "right_")))
            self.assertTrue((path.parent / "bimanual_scene.xml").exists())
            self.assertIn("cube_free", [x.get("name") for x in root.iter("freejoint")])
            self.assertIn("target", [x.get("name") for x in root.iter("geom")])

    def test_output_location_must_keep_relative_mesh_paths(self):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            source = base / "yam.xml"
            source.write_text(FAKE_YAM)
            with self.assertRaises(ValueError):
                build(source, base / "separate" / "out.xml")


if __name__ == "__main__":
    unittest.main()
