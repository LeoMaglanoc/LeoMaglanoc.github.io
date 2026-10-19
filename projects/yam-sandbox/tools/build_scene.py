"""Construct a bimanual MuJoCo scene from an unmodified Menagerie YAM model.

Keeps the original per-arm kinematics, inertias, collisions, visuals, servo
parameters and joint-coupled fingers. Only prefixes entity names, duplicates
each arm, changes its fixed-base world transform and adds props/cameras.
"""
from __future__ import annotations

import argparse
from copy import deepcopy
from pathlib import Path
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
YAM_DIR = ROOT / "upstream"


def element(tag: str, parent: ET.Element, **attributes: str) -> ET.Element:
    return ET.SubElement(parent, tag, attributes)


def duplicate_arm(source: ET.Element, prefix: str, pos: str, quat: str) -> ET.Element:
    arm = deepcopy(source)
    for item in arm.iter():
        if item.tag in {"body", "joint", "freejoint", "geom", "site", "camera"} and "name" in item.attrib:
            item.set("name", prefix + item.get("name", ""))
        for attr in ("body", "body1", "body2", "joint", "joint1", "joint2", "site", "site1", "site2"):
            if item.get(attr):
                item.set(attr, prefix + item.get(attr, ""))
    arm.set("pos", pos)
    arm.set("quat", quat)
    return arm


def build(source_path: Path = YAM_DIR / "yam.xml", output_path: Path | None = None) -> Path:
    source_path = source_path.resolve()
    output_path = (output_path or source_path.with_name("bimanual_scene.xml")).resolve()
    if source_path.parent != output_path.parent:
        raise ValueError("Write the generated scene beside yam.xml so relative meshdir works")
    original = ET.parse(source_path).getroot()
    original_world = original.find("worldbody")
    if original_world is None:
        raise RuntimeError("YAM source contains no worldbody")
    source_arm = original_world.find("body[@name='arm']")
    if source_arm is None:
        raise RuntimeError("YAM source has no top-level arm")
    source_actuators = original.find("actuator")
    source_equality = original.find("equality")
    if source_actuators is None or source_equality is None:
        raise RuntimeError("YAM source has no actuators or gripper coupling")

    # Preserve all static model definitions from the original exactly once.
    root = ET.Element("mujoco", {"model": "Dream-inspired bimanual YAM sandbox"})
    for node in original:
        if node.tag in {"compiler", "option", "default", "asset", "size", "custom"}:
            root.append(deepcopy(node))

    visual = element("visual", root)
    element("headlight", visual, diffuse="0.7 0.7 0.7", ambient="0.25 0.25 0.25")
    element("global", visual, azimuth="135", elevation="-22")
    world = element("worldbody", root)
    element("light", world, name="key_light", pos="0 -0.6 2.3", dir="0 0 -1", directional="true")
    element("light", world, name="fill_light", pos="0.6 1.1 1.7", dir="0 0 -1", directional="true")
    element("geom", world, name="floor", type="plane", size="2 2 0.05", pos="0 0 0", rgba="0.17 0.20 0.25 1", friction="1 0.1 0.05")
    element("geom", world, name="tabletop", type="box", size="0.71 0.49 0.035", pos="0 0 0.695", rgba="0.50 0.57 0.63 1", friction="1.2 0.1 0.05")
    for x in ("-0.61", "0.61"):
        for y in ("-0.39", "0.39"):
            element("geom", world, name=f"leg_{x}_{y}", type="box", size="0.025 0.025 0.33", pos=f"{x} {y} 0.33", rgba="0.26 0.31 0.37 1")

    # Arm bases are fixed to the tabletop. Right arm faces the left arm.
    world.append(duplicate_arm(source_arm, "left_", "-0.44 0.07 0.732", "1 0 0 0"))
    world.append(duplicate_arm(source_arm, "right_", "0.44 0.07 0.732", "0 0 0 1"))

    cube = element("body", world, name="cube", pos="-0.10 -0.10 0.82")
    element("freejoint", cube, name="cube_free")
    element("geom", cube, name="cube_geom", type="box", size="0.031 0.031 0.031", mass="0.06", rgba="0.96 0.62 0.25 1", friction="1.4 0.1 0.02")
    cylinder = element("body", world, name="cylinder", pos="0.08 0.07 0.82")
    element("freejoint", cylinder, name="cylinder_free")
    element("geom", cylinder, name="cylinder_geom", type="cylinder", size="0.024 0.031", mass="0.09", rgba="0.27 0.65 0.92 1", friction="1.1 0.1 0.03")
    element("geom", world, name="target", type="cylinder", size="0.065 0.003", pos="0.25 -0.12 0.733", rgba="0.20 0.9 0.55 0.75", contype="0", conaffinity="0")

    # All cameras are real MuJoCo cameras. Native viewer supports camera selection.
    element("camera", world, name="overview", pos="0 -1.65 1.54", xyaxes="1 0 0 0 0.50 0.866", fovy="45")
    element("camera", world, name="front", pos="0 -1.1 1.05", xyaxes="1 0 0 0 0.29 0.957", fovy="60")
    element("camera", world, name="top", pos="0 0 1.95", xyaxes="1 0 0 0 1 0", fovy="50")
    for prefix in ("left_", "right_"):
        arm = world.find(f"body[@name='{prefix}arm']")
        if arm is None:
            raise AssertionError("Arm duplication failed")
        wrist = next((e for e in arm.iter("body") if e.get("name") == f"{prefix}link_6"), None)
        if wrist is None:
            raise RuntimeError("YAM gripper link_6 not found")
        element("camera", wrist, name=f"{prefix}wrist_cam", pos="0 0 0.12", xyaxes="1 0 0 0 1 0", fovy="72")

    equality = element("equality", root)
    actuators = element("actuator", root)
    for prefix in ("left_", "right_"):
        for entry in source_equality:
            x = deepcopy(entry)
            for attr in ("joint1", "joint2", "joint", "name"):
                if x.get(attr):
                    x.set(attr, prefix + x.get(attr, ""))
            equality.append(x)
        for entry in source_actuators:
            x = deepcopy(entry)
            for attr in ("joint", "name", "site", "body"):
                if x.get(attr):
                    x.set(attr, prefix + x.get(attr, ""))
            actuators.append(x)

    ET.indent(root, space="  ")
    output_path.write_text(ET.tostring(root, encoding="unicode") + "\n", encoding="utf-8")
    return output_path


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--yam", type=Path, default=YAM_DIR / "yam.xml")
    args = parser.parse_args()
    print(f"Generated: {build(args.yam)}")
