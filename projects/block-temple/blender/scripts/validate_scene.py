import bpy, json, math
from pathlib import Path
from mathutils import Vector
required={'ENVIRONMENT','COLLISION','BACKGROUND','EDITABLE_MARKERS','LIGHTS','DEBUG'}
assert required <= set(bpy.data.collections.keys()), 'Missing collection'
for name in ['SPAWN_Player','MARKER_Secret','EDITABLE_Entrance','EDITABLE_Resource']:
    assert name in bpy.data.objects, f'Missing {name}'
vertices=triangles=meshes=0
lo=Vector((math.inf,)*3); hi=Vector((-math.inf,)*3)
for o in bpy.context.scene.objects:
    assert o.name.startswith(('ENV_','COL_','SPAWN_','MARKER_','EDITABLE_','CHECK_')) or o.type=='LIGHT', o.name
    assert all(math.isfinite(v) for v in o.location),o.name
    if o.type=='CAMERA': assert o.name.startswith('CHECK_'),o.name
    if o.type!='MESH': continue
    assert all(abs(v-1)<1e-5 for v in o.scale), f'Unapplied scale {o.name}'
    assert max(o.dimensions)<350, f'Unexpected bounds {o.name}'
    assert len(o.data.vertices)>0
    o.data.calc_loop_triangles(); vertices+=len(o.data.vertices); triangles+=len(o.data.loop_triangles); meshes+=1
    for p in o.bound_box:
        p=o.matrix_world@Vector(p)
        lo=Vector(tuple(min(a,b) for a,b in zip(lo,p))); hi=Vector(tuple(max(a,b) for a,b in zip(hi,p)))
assert triangles<250000,triangles
stats={'objects':len(bpy.context.scene.objects),'meshes':meshes,'vertices':vertices,'triangles':triangles,'materials':len(bpy.data.materials),'bounds':[list(lo),list(hi)]}
print('PASS Blender validation:',json.dumps(stats))
root=Path(__file__).resolve().parents[2]; (root/'artifacts').mkdir(exist_ok=True)
(root/'artifacts/scene-stats.json').write_text(json.dumps(stats,indent=2))
