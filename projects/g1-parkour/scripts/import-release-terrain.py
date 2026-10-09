"""Split the checked-in release OBJ into native-style convex terrain geoms.

Run from any directory. The source OBJ remains byte-for-byte unchanged; generated
XML retains the original vertices/faces instead of approximating boxes by bounds.
"""
from pathlib import Path
import hashlib
import json
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
source = ROOT / 'public/scenes/php-release/terrain.obj'
vertices, faces = [], []
for line in source.read_text().splitlines():
    fields = line.split()
    if not fields:
        continue
    if fields[0] == 'v':
        vertices.append(tuple(map(float, fields[1:4])))
    elif fields[0] == 'f':
        ids = [int(x.split('/')[0]) for x in fields[1:]]
        ids = [x - 1 if x > 0 else len(vertices) + x for x in ids]
        for i in range(1, len(ids) - 1):
            faces.append((ids[0], ids[i], ids[i + 1]))
parents = list(range(len(vertices)))
def find(i):
    while parents[i] != i:
        parents[i] = parents[parents[i]]
        i = parents[i]
    return i
for face in faces:
    for i in face[1:]:
        parents[find(i)] = find(face[0])
components = {}
for i in range(len(vertices)):
    components.setdefault(find(i), []).append(i)
assert len(components) == 13, 'Recheck the release terrain contract if the OBJ changes'
xml = ET.Element('mujocoinclude')
assets = ET.SubElement(xml, 'asset')
world = ET.SubElement(xml, 'worldbody')
body = ET.SubElement(world, 'body', name='terrain_boxes')
colors = ['0.2 0.5 0.9 1', '0.2 0.8 0.4 1', '0.95 0.75 0.2 1', '0.9 0.3 0.3 1']
records = []
for index, ids in enumerate(components.values()):
    mapping = {old: new for new, old in enumerate(ids)}
    local_faces = [tuple(mapping[i] for i in f) for f in faces if f[0] in mapping]
    # Each closed component gets its own collider, as in native SceneManager.
    edges = {}
    for a, b, c in local_faces:
        for x, y in [(a, b), (b, c), (c, a)]:
            edge = tuple(sorted((x, y)))
            edges[edge] = edges.get(edge, 0) + 1
    assert all(n == 2 for n in edges.values()), 'Expected closed release components'
    name = f'php_release_terrain_{index}'
    vs = [vertices[i] for i in ids]
    ET.SubElement(assets, 'mesh', name=name,
                  vertex=' '.join(format(x, '.9g') for v in vs for x in v),
                  face=' '.join(str(x) for f in local_faces for x in f), smoothnormal='false')
    geom = 'floor' if index == 0 else f'terrain_box_{index + 1}'
    ET.SubElement(world if index == 0 else body, 'geom', name=geom, type='mesh', mesh=name,
                  rgba='0.35 0.42 0.48 1' if index == 0 else colors[(index - 1) % 4],
                  contype='2', conaffinity='1', friction='0.7 0.005 0.001',
                  solimp='0.99 0.99 0.01 0.5 2', solref='0.001 1')
    records.append(dict(name=geom, vertices=len(vs), faces=len(local_faces),
                        minimum=[min(v[i] for v in vs) for i in range(3)],
                        maximum=[max(v[i] for v in vs) for i in range(3)]))
ET.indent(xml, space='  ')
(source.parent / 'terrain.xml').write_text(ET.tostring(xml, encoding='unicode') + '\n')
(source.parent / 'terrain-manifest.json').write_text(json.dumps(dict(
    source='amazon-far/holosoma', commit='70a344f50de01a77ed3d5ff95127fbb95795c11b',
    path='src/holosoma/holosoma/data/terrains/terrain.obj',
    sha256=hashlib.sha256(source.read_bytes()).hexdigest(), components=records), indent=2) + '\n')
print('Generated', len(records), 'separate release terrain colliders')

# The original finish gate is a display-only body in the web scene, not part of
# its old OBJ export. Keep that scene body unchanged and include its geometry in
# a separate combined OBJ for users exporting the complete web course.
original_scene = ROOT / 'scripts/templates/g1_with_terrain.xml'
final_scene = ROOT / 'public/scenes/g1_release_terrain.xml'
original_gate = ET.parse(original_scene).find(".//body[@name='finish_marker']")
final_gate = ET.parse(final_scene).find(".//body[@name='finish_marker']")
assert original_gate is not None and final_gate is not None

def gate_signature(body):
    return [(node.tag, dict(node.attrib)) for node in body.iter()]

assert gate_signature(original_gate) == gate_signature(final_gate), 'Preserve the original finish gate in the final scene'
assert set(original_gate.attrib) == {'name'}, 'Gate body transform requires export support'
corners = [(-1, -1, -1), (1, -1, -1), (1, 1, -1), (-1, 1, -1),
           (-1, -1, 1), (1, -1, 1), (1, 1, 1), (-1, 1, 1)]
quads = [(4, 5, 6, 7), (1, 0, 3, 2), (0, 1, 5, 4),
         (2, 3, 7, 6), (1, 2, 6, 5), (3, 0, 4, 7)]
combined = [source.read_text().rstrip(), '\n# Original web-demo finish gate (display-only in the XML scene)',
            'mtllib terrain-with-finish.mtl']
materials, gate_records = [], []
vertex_offset = len(vertices)
for geom in original_gate.findall('geom'):
    assert geom.get('type') == 'box' and not any(k in geom.attrib for k in ('quat', 'euler', 'axisangle', 'xyaxes', 'zaxis'))
    assert geom.get('contype') == '0' and geom.get('conaffinity') == '0'
    name = geom.attrib['name']
    pos = list(map(float, geom.attrib['pos'].split()))
    size = list(map(float, geom.attrib['size'].split()))
    rgba = list(map(float, geom.attrib['rgba'].split()))
    combined += [f'o {name}', f'usemtl {name}']
    for corner in corners:
        combined.append('v ' + ' '.join(format(pos[i] + corner[i] * size[i], '.9g') for i in range(3)))
    for face in quads:
        combined.append('f ' + ' '.join(str(vertex_offset + i + 1) for i in face))
    vertex_offset += 8
    materials += [f'newmtl {name}', 'Kd ' + ' '.join(map(str, rgba[:3])), f'd {rgba[3]}', 'illum 2', '']
    gate_records.append(dict(name=name, position=pos, half_extents=size, rgba=rgba,
                             minimum=[pos[i] - size[i] for i in range(3)],
                             maximum=[pos[i] + size[i] for i in range(3)]))
combined_path = source.parent / 'terrain-with-finish.obj'
combined_path.write_text('\n'.join(combined) + '\n')
(source.parent / 'terrain-with-finish.mtl').write_text('\n'.join(materials))
manifest_path = source.parent / 'terrain-manifest.json'
manifest = json.loads(manifest_path.read_text())
manifest['finish_gate'] = dict(source='g1_with_terrain.xml#finish_marker',
    collision_enabled=False, visible_to_policy_depth=False, geoms=gate_records,
    note='OBJ/MTL preserve geometry/colors; non-collision and depth exclusion remain XML/renderer settings.')
manifest['combined_export'] = dict(path=combined_path.name,
    material='terrain-with-finish.mtl', sha256=hashlib.sha256(combined_path.read_bytes()).hexdigest())
manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')
print('Preserved original finish gate and exported', combined_path.name)
