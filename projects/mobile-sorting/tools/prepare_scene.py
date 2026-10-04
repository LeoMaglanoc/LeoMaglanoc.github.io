"""Generate the compact three-station scene; no runtime model recompilation."""
from pathlib import Path
import xml.etree.ElementTree as ET

root = ET.Element('mujoco', model='endless_mobile_sorting')
ET.SubElement(root, 'include', file='tiago.xml')
default = ET.SubElement(root, 'default')
ET.SubElement(default, 'geom', friction='0.9 0.005 0.001', solref='0.008 1')
world = ET.SubElement(root, 'worldbody')
ET.SubElement(world, 'geom', name='floor', type='plane', size='4 4 0.1', rgba='0.16 0.21 0.24 1', contype='1', conaffinity='3', group='1')
def box(name, pos, size, color):
    ET.SubElement(world, 'geom', name=name, type='box', pos=pos, size=size, rgba=color, contype='1', conaffinity='3', group='1')
box('input_top', '0.68 0 0.68', '0.23 0.28 0.025', '0.60 0.65 0.62 1')
for x in [0.50, 0.86]:
    for y in [-0.25, 0.25]:
        box(f'leg_{x}_{y}', f'{x} {y} 0.325', '0.025 0.025 0.325', '0.20 0.28 0.31 1')
for cls, y, color in [('blue', 2, '0.18 0.44 0.68 1'), ('red', -2, '0.73 0.28 0.22 1')]:
    box(f'{cls}_pedestal', f'0.68 {y} 0.30', '0.20 0.24 0.30', '0.25 0.32 0.34 1')
    box(f'{cls}_bottom', f'0.68 {y} 0.62', '0.23 0.27 0.02', color)
    for sign in [-1, 1]:
        box(f'{cls}_wall_x_{sign}', f'{0.68+sign*0.23} {y} 0.70', '0.015 0.285 0.08', color)
        box(f'{cls}_wall_y_{sign}', f'0.68 {y+sign*0.27} 0.70', '0.23 0.015 0.08', color)
for i in range(5):
    b = ET.SubElement(world, 'body', name=f'object_{i}', pos=f'0.8 0 {0.75+i*.1}')
    ET.SubElement(b, 'freejoint', name=f'object_joint_{i}')
    ET.SubElement(b, 'geom', name=f'object_geom_{i}', type='box', size='0.032 0.020 0.025', mass='0.065',
                  rgba='0.18 0.51 0.84 1', friction='1.2 0.01 0.001', condim='4', group='1',
                  contype='1', conaffinity='3', solref='0.006 1', solimp='0.95 0.99 0.001')
ET.indent(root)
path = Path(__file__).resolve().parents[1] / 'robots/tiago/scene.xml'
path.write_text(ET.tostring(root, encoding='unicode')+'\n')
