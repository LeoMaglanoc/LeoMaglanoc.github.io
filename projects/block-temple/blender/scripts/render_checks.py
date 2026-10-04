import bpy, sys
from pathlib import Path
root=Path(__file__).resolve().parents[2]; out=root/'artifacts/renders'; out.mkdir(parents=True,exist_ok=True)
scene=bpy.context.scene
valid={i.identifier for i in scene.render.image_settings.bl_rna.properties['file_format'].enum_items}
assert 'PNG' in valid
scene.render.image_settings.file_format='PNG'; scene.cycles.samples=8
scene.render.resolution_x=800; scene.render.resolution_y=450
views=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else ['entrance','grand_hall','council','hallway','archive','overlook','exterior']
for view in views:
    scene.camera=bpy.data.objects['CHECK_'+view]; scene.render.filepath=str(out/(view+'.png'))
    bpy.ops.render.render(write_still=True)
