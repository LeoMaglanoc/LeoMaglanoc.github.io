"""Reproduce the browser TIAGo derivative from a pinned Menagerie revision."""
import json
import pathlib
import urllib.request
import xml.etree.ElementTree as ET
import trimesh

ROOT = pathlib.Path(__file__).resolve().parents[1]
REV = "4d038b3feae26ec82b46a4d586379114012a8ac7"
BASE = f"https://raw.githubusercontent.com/google-deepmind/mujoco_menagerie/{REV}/pal_tiago/"
DEST = ROOT / "robots/tiago"

def download(name):
    return urllib.request.urlopen(BASE + name).read()

def geom(parent, **attrs):
    return ET.SubElement(parent, "geom", {k: str(v) for k, v in attrs.items()})

DEST.mkdir(parents=True, exist_ok=True)
(DEST / "LICENSE").write_bytes(download("LICENSE"))
source = download("tiago.xml")
(DEST / "upstream.xml").write_bytes(source)
tree = ET.fromstring(source)
tree.find("compiler").set("meshdir", "assets")
tree.find("compiler").set("fusestatic", "false")
tree.find("option").set("timestep", "0.002")
tree.find("option").set("iterations", "30")
tree.find("option").set("tolerance", "1e-8")
tree.find("default/geom").set("group", "2")
tree.find("default/geom").set("contype", "0")
tree.find("default/geom").set("conaffinity", "0")
tree.find("default/default[@class='arm']/geom").set("contype", "0")
tree.find("default/default[@class='arm']/geom").set("conaffinity", "0")

# Keep the original kinematic chain and inertias, use decimated visual meshes.
manifest = []
for mesh in tree.findall("asset/mesh"):
    name = mesh.get("file")
    path = DEST / "assets" / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(download("assets/" + name))
    visual = trimesh.load(path, force="mesh")
    if "gripper" in name:
        print(name, visual.bounds.tolist())
    if len(visual.faces) > 1800:
        visual = visual.simplify_quadric_decimation(face_count=1800)
    path.write_bytes(visual.export(file_type="stl"))
    manifest.append(name)

body = tree.find("worldbody/body")
# Replace eight passive caster joints with low-friction support spheres.
for child in list(body):
    if child.tag == "body" and child.get("name", "").startswith("caster_"):
        body.remove(child)
for x, y in [(0.20, 0.15), (0.20, -0.15), (-0.20, 0.15), (-0.20, -0.15)]:
    geom(body, type="sphere", size="0.025", pos=f"{x} {y} 0.025", group="3",
         contype="2", conaffinity="1", friction="0.002 0.001 0.0001", priority="1", mass="0")
geom(body, name="base_collision", type="cylinder", size="0.27 0.12", pos="0 0 0.19",
     group="3", contype="2", conaffinity="1", mass="0")
for side in ["left", "right"]:
    wheel = body.find(f"body[@name='wheel_{side}_link']")
    geom(wheel, name=f"wheel_{side}_collision", type="cylinder", size="0.0985 0.022",
         group="3", contype="2", conaffinity="1", friction="1.0 0.002 0.0001",
         condim="6", mass="0")

# Fixed torso/head reduce runtime DoFs without changing the arm's geometry.
torso = body.find("body[@name='torso_lift_link']")
torso.set("pos", "-0.062 0 1.2385")
torso.remove(torso.find("joint"))
for head in torso.findall(".//body"):
    if head.get("name", "").startswith("head_"):
        for joint in head.findall("joint"):
            head.remove(joint)
arm = torso.find("body[@name='arm_1_link']")
for b in [arm, *arm.findall(".//body")]:
    name = b.get("name", "")
    if name.startswith("arm_"):
        # Conservative capsules around links, avoiding expensive mesh contacts.
        child = b.find("body")
        end = child.get("pos", "0 0 0.06") if child is not None else "0 0 0.06"
        if sum(float(v)**2 for v in end.split()) > 0.002:
            geom(b, type="capsule", size="0.035", fromto=f"0 0 0 {end}",
                 group="3", contype="2", conaffinity="1", mass="0")
    if name.startswith("gripper_"):
        joint = b.find("joint")
        joint.set("damping", "2")
        joint.set("frictionloss", "0.1")
        sign = 1 if "right" in name else -1
        geom(b, name=f"{name}_pad", type="box", size="0.008 0.016 0.035",
             pos=f"{sign * 0.008} 0 -0.180", group="1", rgba="0.12 0.18 0.2 1",
             contype="2", conaffinity="1", friction="1.5 0.01 0.001", condim="4",
             solref="0.006 1", solimp="0.95 0.99 0.001", mass="0")
wrist = arm.find(".//body[@name='arm_7_link']")
ET.SubElement(wrist, "site", name="grasp_site", pos="0 0 0.256575", size="0.008", group="5")
actuators = ET.SubElement(tree, "actuator")
for i in range(1, 8):
    ET.SubElement(actuators, "position", name=f"arm_{i}", joint=f"arm_{i}_joint",
                  kp="1500" if i <= 4 else "400", kv="70" if i <= 4 else "15",
                  forcerange="-43 43" if i <= 2 else "-26 26" if i <= 4 else "-6.6 6.6")
for side in ["left", "right"]:
    ET.SubElement(actuators, "position", name=f"finger_{side}", joint=f"gripper_{side}_finger_joint",
                  kp="700", kv="8", ctrlrange="0 0.045", forcerange="-12 12")
    ET.SubElement(actuators, "velocity", name=f"wheel_{side}", joint=f"wheel_{side}_joint",
                  kv="15", ctrlrange="-8 8", forcerange="-35 35")
ET.indent(tree)
(DEST / "tiago.xml").write_text(ET.tostring(tree, encoding="unicode") + "\n")
(ROOT / "asset-manifest.json").write_text(json.dumps({"revision": REV, "meshes": manifest}, indent=2) + "\n")
print("Prepared", len(manifest), "meshes", sum(p.stat().st_size for p in (DEST/'assets').rglob('*.stl')), "bytes")
