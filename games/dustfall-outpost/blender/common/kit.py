"""Original geometry in game coordinates (X right, Y up, Z toward viewer)."""
import bpy, math, random, struct, zlib
from pathlib import Path
from mathutils import Vector
ROOT = Path(__file__).resolve().parents[2]
COLORS = {'plaster':(.50,.37,.26,1),'pale':(.65,.55,.40,1),'metal':(.14,.20,.21,1),'rust':(.38,.18,.09,1),'paint':(.14,.38,.40,1),'cloth':(.55,.24,.12,1),'rubber':(.065,.08,.075,1),'glass':(.08,.28,.34,1),'orange':(1,.40,.08,1),'blue':(.18,.82,.87,1),'sand':(.50,.39,.29,1)}
MATS = {}
TEXTURES = {}

def worn_texture(name,color):
    if name in TEXTURES: return TEXTURES[name]
    directory=ROOT/"blender/build/textures"; directory.mkdir(parents=True,exist_ok=True)
    rng=random.Random(37+sum(map(ord,name))); width=128; rows=[]
    for y in range(width):
        row=bytearray()
        for x in range(width):
            grain=rng.uniform(.9,1.08)
            # Sparse rubbed edges and long scratches; all original, baked pixels.
            if x<3 or x>124 or y<2: grain*=.7
            if (y%31==0 and x%29<12) or (x%47==0 and y%23<9): grain*=.62
            row.extend(int(max(0,min(255,c*grain*255))) for c in color[:3])
        rows.append(b"\x00"+bytes(row))
    def chunk(tag,data): return struct.pack(">I",len(data))+tag+data+struct.pack(">I",zlib.crc32(tag+data)&0xffffffff)
    path=directory/(name+".png")
    path.write_bytes(b"\x89PNG\r\n\x1a\n"+chunk(b"IHDR",struct.pack(">IIBBBBB",width,width,8,2,0,0,0))+chunk(b"IDAT",zlib.compress(b"".join(rows)))+chunk(b"IEND",b""))
    image=bpy.data.images.load(str(path)); image.pack(); TEXTURES[name]=image; return image

def reset():
    bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
    MATS.clear()
    for name,color in COLORS.items():
        m=bpy.data.materials.new(name); m.diffuse_color=color; m.use_nodes=True
        p=m.node_tree.nodes.get('Principled BSDF'); p.inputs['Base Color'].default_value=color; p.inputs['Roughness'].default_value=.85
        if name not in ('orange','blue','glass','rubber'):
            image_node=m.node_tree.nodes.new('ShaderNodeTexImage'); image_node.image=worn_texture(name,color); p.inputs['Base Color'].default_value=(1,1,1,1); m.node_tree.links.new(image_node.outputs['Color'],p.inputs['Base Color'])
        if name in ('orange','blue'):
            p.inputs['Emission'].default_value=color; p.inputs['Emission Strength'].default_value=2
        MATS[name]=m

def loc(p): return (p[0],-p[2],p[1])
def finish(obj,name,mat):
    obj.name=name; obj.data.materials.append(MATS[mat]); return obj

def box(name,p,s,mat='metal',bevel=0):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc(p)); o=bpy.context.object; o.scale=(s[0],s[2],s[1]); bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    finish(o,name,mat)
    if bevel:
        mod=o.modifiers.new('Small manufactured edge','BEVEL'); mod.width=bevel; mod.segments=1
        bpy.context.view_layer.objects.active=o; bpy.ops.object.modifier_apply(modifier=mod.name)
    return o

def cyl(name,p,r,depth,mat='metal',axis='y',vertices=12):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=r,depth=depth,location=loc(p)); o=bpy.context.object
    if axis=='x': o.rotation_euler[1]=math.pi/2
    if axis=='z': o.rotation_euler[0]=math.pi/2
    return finish(o,name,mat)

def cone(name,p,r1,r2,depth,mat='plaster',vertices=12):
    bpy.ops.mesh.primitive_cone_add(vertices=vertices,radius1=r1,radius2=r2,depth=depth,location=loc(p)); return finish(bpy.context.object,name,mat)

def beam(name,a,b,width,mat='metal'):
    av,bv=Vector(loc(a)),Vector(loc(b)); delta=bv-av
    o=box(name,(0,0,0),(width,width,delta.length),mat)
    # Cube local Y follows the beam; coordinates for box have Y/Z swapped.
    o.location=(av+bv)/2; o.rotation_euler=delta.to_track_quat('Y','Z').to_euler(); return o

def export(name):
    out=ROOT/'godot/assets/generated'; out.mkdir(parents=True,exist_ok=True)
    # Merge by material to keep repeated kit instances inexpensive to draw.
    for mat in list(MATS.values()):
        bpy.ops.object.select_all(action='DESELECT')
        objects=[o for o in bpy.context.scene.objects if o.type=='MESH' and o.data.materials and o.data.materials[0]==mat]
        if not objects: continue
        for o in objects: o.select_set(True)
        bpy.context.view_layer.objects.active=objects[0]; bpy.ops.object.join()
        objects[0].name=name+'_'+mat.name
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(filepath=str(out/(name+'.glb')),export_format='GLB',use_selection=True)
    build=ROOT/'blender/build'; build.mkdir(exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(build/(name+'.blend')))

def building(w=8,d=7,h=5,interior=False):
    box('Foundation',(0,.2,0),(w+.5,.4,d+.5),'metal',.08)
    box('Back',(0,h/2,-d/2),(w,h,.45),'plaster',.1)
    for x in (-w/2,w/2): box('Side',(x,h/2,0),(.45,h,d),'plaster',.08)
    for x in (-1,1): box('Front pier',(x*(w/4+.65),h/2,d/2),(w/2-1.3,h,.45),'plaster',.08)
    box('Lintel',(0,h-.8,d/2),(2.7,1.6,.6),'pale',.08)
    box('Roof',(0,h,0),(w+.65,.35,d+.65),'pale',.08)
    for x in (-w/2+.45,w/2-.45): box('Buttress',(x,h/2,d/2+.28),(.38,h+.2,.5),'pale',.04)
    for x in (-w/2,w/2): box('Roof parapet',(x,h+.38,0),(.35,.65,d),'plaster',.05)
    box('Rooftop duct',(-1.6,h+.5,-1),(2,.8,2),'metal',.06)
    for i in range(5): box('Vent slot',(-1.6,h+.52,-.02+i*.1),(1.5,.07,.04),'rubber')
    cyl('Roof vent',(2,h+.9,-1.5),.38,1.5,'rust')
    box('Front stripe',(0,h-1.1,d/2+.32),(w-.8,.18,.03),'paint')
    for x in (-2.6,2.6):
        box('Shutter surround',(x,2.5,d/2+.27),(1.5,1.8,.14),'metal',.04)
        for i in range(6): box('Shutter',(x,1.85+i*.24,d/2+.36),(1.3,.08,.12),'paint')
    box('Door surround',(0,1.7,d/2+.26),(2.8,3.4,.15),'metal',.03)
    if not interior: box('Closed door',(0,1.5,d/2+.38),(2.1,3,.12),'rust',.02)
    else:
        # Leave the actual doorway empty. Frame strips instead of an occluding panel.
        for x in (-1.3,1.3): box('Door rail',(x,1.55,d/2+.4),(.12,3.1,.2),'metal')
        box('Door upper rail',(0,3.1,d/2+.4),(2.7,.18,.2),'metal')
        # Remove the filled surround, keeping an opening.
        bpy.data.objects.remove(bpy.data.objects['Door surround'],do_unlink=True)
        box('Work bench',(-2.7,.85,-1),(2.4,.16,3),'metal',.03)
        for z in (-2,0): box('Bench foot',(-2.7,.4,z),(.2,.8,.2),'rust')
        box('Tool cabinet',(2.8,1,-2),(1.5,2,1),'paint',.04)
        for i in range(4): box('Cabinet drawer',(2.8,.35+i*.45,-1.45),(1.3,.3,.04),'metal')
        box('Interior floor',(0,.43,0),(w-.5,.07,d-.5),'rust')
