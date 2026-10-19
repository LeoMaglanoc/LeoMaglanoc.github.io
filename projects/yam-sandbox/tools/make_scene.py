"""Offline scene generation; retain YAM frames, joints, meshes and collision shapes."""
from pathlib import Path
import xml.etree.ElementTree as ET
from build_scene import build
ROOT=Path(__file__).resolve().parents[1]
p=build(ROOT/'upstream/yam.xml');root=ET.parse(p).getroot();p.unlink()
# Grip force tuning after measured transfer slips, capped at 12 N.
finger=root.find("default/default/default[@class='finger']/position")
finger.set('kp','600');finger.set('kv','20');finger.set('forcerange','-12 12')
# A finite-width pad gripping a round cylinder needs torsional/rolling friction.
cylinder=root.find("worldbody/body[@name='cylinder']/geom")
cylinder.set('size','0.024 0.045')
cylinder.set('condim','6');cylinder.set('friction','1.1 0.02 0.002')
world=root.find('worldbody');world.remove(world.find("geom[@name='target']"))
for side,xy,color in [('left',(-.22,-.22),'0.96 0.62 0.25 .45'),('right',(.22,-.18),'0.27 0.65 0.92 .45')]:
 ET.SubElement(world,'geom',name=side+'_goal',type='cylinder',size='.05 .001',pos=f'{xy[0]} {xy[1]} .731',rgba=color,contype='0',conaffinity='0')
ET.indent(root,space='  ')
(ROOT/'scene/bimanual_scene.xml').write_text(ET.tostring(root,encoding='unicode')+'\n')
