import bpy, json, struct
from pathlib import Path
root=Path(__file__).resolve().parents[2]
bpy.ops.object.select_all(action='DESELECT')
for c in ['ENVIRONMENT','COLLISION','BACKGROUND','EDITABLE_MARKERS']:
    for o in bpy.data.collections[c].objects:
        o.hide_set(False); o.select_set(True)
# Blender enum values inspected from the installed exporter, before assignment.
values={i.identifier for i in bpy.ops.export_scene.gltf.get_rna_type().properties['export_format'].enum_items}
if not values:
    from io_scene_gltf2 import get_format_items
    values={item[0] for item in get_format_items(None,bpy.context)}
assert 'GLB' in values,values
p=root/'godot/assets/coruscant_temple.glb'
bpy.ops.export_scene.gltf(filepath=str(p),export_format='GLB',use_selection=True,export_yup=True,export_cameras=False,export_lights=False)
assert p.stat().st_size>10000
raw=p.read_bytes()
length,kind=struct.unpack_from('<II',raw,12)
assert kind==0x4E4F534A
asset=json.loads(raw[20:20+length])
visual=[asset['meshes'][n['mesh']] for n in asset['nodes'] if n.get('name','').startswith('ENV_') and 'mesh' in n]
assert visual
assert all('COLOR_0' in primitive['attributes'] for m in visual for primitive in m['primitives']), 'Missing baked vertex colors'
print('PASS GLB export:',p.stat().st_size,'bytes;',len(visual),'shaded visual meshes')
