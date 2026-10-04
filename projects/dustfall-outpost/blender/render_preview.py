import bpy, sys, math
from pathlib import Path
from mathutils import Vector
root=Path(__file__).resolve().parents[1]
args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else ['ship','workshop','stall','tower','robot']
for asset in args:
    bpy.ops.wm.open_mainfile(filepath=str(root/'blender/build'/f'{asset}.blend'))
    scene=bpy.context.scene; scene.render.engine='CYCLES'; scene.cycles.device='CPU'; scene.cycles.samples=16; scene.cycles.use_denoising=False
    scene.world.color=(.3,.3,.3); scene.render.resolution_x=800; scene.render.resolution_y=640; scene.render.resolution_percentage=100
    points=[o.matrix_world@Vector(v) for o in scene.objects if o.type=='MESH' for v in o.bound_box]
    lo=Vector(tuple(min(v[i] for v in points) for i in range(3))); hi=Vector(tuple(max(v[i] for v in points) for i in range(3)))
    center=(lo+hi)/2; radius=max(hi-lo)*1.25
    bpy.ops.object.light_add(type='AREA',location=center+Vector((radius,-radius,radius*2))); bpy.context.object.data.energy=1800; bpy.context.object.data.size=radius
    bpy.ops.object.light_add(type='SUN',location=(0,0,10)); bpy.context.object.rotation_euler=(.5,-.4,-.5); bpy.context.object.data.energy=2
    bpy.ops.object.camera_add(); camera=bpy.context.object; scene.camera=camera; camera.data.type='ORTHO'; camera.data.ortho_scale=max(hi-lo)*1.6
    for name,offset in [('front',(0,-1,.45)),('quarter',(1,-1,.7)),('overview',(.1,-.3,1.4))]:
        camera.location=center+Vector(offset)*radius; camera.rotation_euler=(center-camera.location).to_track_quat('-Z','Y').to_euler()
        scene.render.filepath=str(root/'previews'/f'{asset}-{name}.png'); bpy.ops.render.render(write_still=True)
