"""Reproducible, reference-authored intact temple. Godot coordinates are metres.
Run with Blender --background --python this_file. No extracted game assets.
"""
import bpy, math, json, random
from pathlib import Path
from mathutils import Vector
ROOT = Path(__file__).resolve().parents[2]
FLOOR = 4.0
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
for n in ('ENVIRONMENT','COLLISION','BACKGROUND','EDITABLE_MARKERS','LIGHTS','DEBUG'):
    c=bpy.data.collections.new(n); scene.collection.children.link(c)
materials={}
def material(name, color, emission=0, rough=.8):
    m=bpy.data.materials.new(name); m.use_nodes=True; m.diffuse_color=(*color,1)
    node=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
    linear=tuple(v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in color)
    node.inputs['Base Color'].default_value=(*linear,1)
    node.inputs['Roughness'].default_value=rough
    if emission:
        node.inputs['Emission Color'].default_value=(*color,1)
        node.inputs['Emission Strength'].default_value=emission
    materials[name]=m
    return m
material('Limestone',(.43,.45,.46)); material('Ivory',(.66,.65,.60))
material('DarkStone',(.17,.19,.20)); material('Floor',(.55,.55,.51),rough=.55)
material('Burgundy',(.25,.12,.12)); material('Bronze',(.36,.28,.18),rough=.5)
material('Window',(.37,.49,.58),.2); material('WarmLight',(.93,.82,.59),2)
material('BlueLight',(.16,.58,.84),2); material('Archive',(.09,.24,.31))
material('City',(.12,.18,.24)); material('CityLights',(.42,.64,.77),1)
# Original painted skyline texture, used as a cheap city illusion behind windows.
window=materials['Window']; node=next(n for n in window.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
tex=window.node_tree.nodes.new('ShaderNodeTexImage'); tex.image=bpy.data.images.load(str(ROOT/'blender/city_window.png')); tex.image.pack()
window.node_tree.links.new(tex.outputs['Color'],node.inputs['Base Color'])
window.node_tree.links.new(tex.outputs['Color'],node.inputs['Emission Color']); node.inputs['Emission Strength'].default_value=.4

# Accumulate a material-batched mesh per room. Modules remain pure repeatable functions.
batches={}; colliders={}; markers={}
def coord(p): return (p[0],-p[2],p[1])
def meshpart(zone, mat, verts, faces, collision=False):
    target=colliders if collision else batches
    key=(zone,'Collision' if collision else mat)
    vv,ff=target.setdefault(key,([],[])); offset=len(vv)
    vv.extend(coord(v) for v in verts); ff.extend(tuple(offset+i for i in f) for f in faces)
BOX_FACES=[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]
def box(zone,mat,p,s,solid=False,angle=0):
    x,y,z=p; w,h,d=s; co,si=math.cos(angle),math.sin(angle)
    verts=[]
    for dy in [-h/2,h/2]:
        for dx,dz in [(-w/2,-d/2),(w/2,-d/2),(w/2,d/2),(-w/2,d/2)]:
            verts.append((x+dx*co-dz*si,y+dy,z+dx*si+dz*co))
    # coord is a proper rotation. Reverse winding from the Godot-space template
    # so Blender outward normals remain correct.
    faces=[tuple(reversed(f)) for f in BOX_FACES]
    meshpart(zone,mat,verts,faces)
    if solid: meshpart(zone,mat,verts,faces,True)
def cylinder(zone,mat,x,z,r,y,h,n=32,solid=False,r2=None,flute=False):
    verts=[]
    for yy,rr in [(y,r),(y+h,r if r2 is None else r2)]:
        for i in range(n):
            a=2*math.pi*i/n; radius=rr*(.965 if flute and i%2 else 1)
            verts.append((x+math.cos(a)*radius,yy,z+math.sin(a)*radius))
    faces=[tuple(range(n)),tuple(reversed(range(n,2*n)))]
    faces += [(i+n,(i+1)%n+n,(i+1)%n,i) for i in range(n)]
    meshpart(zone,mat,verts,faces)
    if solid: meshpart(zone,mat,verts,faces,True)
def ring(zone,mat,x,z,inner,outer,y,n=64):
    verts=[]
    for r in (inner,outer):
        verts.extend((x+math.cos(2*math.pi*i/n)*r,y,z+math.sin(2*math.pi*i/n)*r) for i in range(n))
    faces=[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    meshpart(zone,mat,verts,faces)
def column(zone,x,z,height=27,r=.85,base=FLOOR):
    n=32 if r>.5 else 12
    cylinder(zone,'DarkStone',x,z,r*1.6,base,.22,n,True)
    cylinder(zone,'Ivory',x,z,r*1.4,base+.22,.45,n)
    cylinder(zone,'Limestone',x,z,r*1.18,base+.67,.35,n)
    cylinder(zone,'Ivory',x,z,r,base+1,height-2,n,True,r2=r*.87,flute=True)
    for yy in [base+1.05,base+2,base+height-1.2]:
        cylinder(zone,'Bronze',x,z,r*1.04,yy,.14,n)
    cylinder(zone,'Limestone',x,z,r*1.25,base+height-1,.4,n)
    cylinder(zone,'Ivory',x,z,r*1.45,base+height-.6,.6,n)
def floor(zone,x0,x1,z0,z1,y=FLOOR):
    box(zone,'Floor',((x0+x1)/2,y-.3,(z0+z1)/2),(x1-x0,.6,z1-z0),True)
    # Large slab seams and dark border; no collisions on shallow inlays.
    for x in range(math.ceil(x0+1),math.floor(x1),4):
        box(zone,'Limestone',(x,y+.005,(z0+z1)/2),(.025,.01,z1-z0))
    for z in range(math.ceil(z0+1),math.floor(z1),4):
        box(zone,'Limestone',((x0+x1)/2,y+.006,z),(x1-x0,.01,.025))
    for x in [x0+.5,x1-.5]: box(zone,'DarkStone',(x,y+.01,(z0+z1)/2),(.5,.02,z1-z0))
def wall_x(zone,x,z0,z1,h=28,y=FLOOR,door=None):
    spans=[(z0,z1)] if door is None else [(z0,door[0]),(door[1],z1)]
    for a,b in spans:
        if b<=a: continue
        box(zone,'Limestone',(x,y+h/2,(a+b)/2),(1,h,b-a),True)
        box(zone,'DarkStone',(x-.51,y+1,(a+b)/2),(.08,2,b-a))
    if door:
        box(zone,'Limestone',(x,y+(h+6)/2,sum(door)/2),(1,h-6,door[1]-door[0]),True)
        for z in door: box(zone,'Ivory',(x-.12,y+3,z), (1.4,6,.35))
        box(zone,'Bronze',(x-.12,y+6,sum(door)/2),(1.4,.3,door[1]-door[0]))
def wall_z(zone,z,x0,x1,h=28,y=FLOOR,door=None):
    spans=[(x0,x1)] if door is None else [(x0,door[0]),(door[1],x1)]
    for a,b in spans:
        if b>a: box(zone,'Limestone',((a+b)/2,y+h/2,z),(b-a,h,1),True)
    if door:
        box(zone,'Limestone',(sum(door)/2,y+(h+6)/2,z),(door[1]-door[0],h-6,1),True)
        for x in door: box(zone,'Ivory',(x,y+3,z),(.4,6,1.4))
        box(zone,'Bronze',(sum(door)/2,y+6,z),(door[1]-door[0],.3,1.4))
def window_x(zone,x,z,w=5,y=8,h=19):
    box(zone,'Window',(x,y+h/2,z),(.06,h,w))
    for zz in [z-w/2,z+w/2]:
        box(zone,'DarkStone',(x-.12,y+h/2,zz),(.3,h+.8,.3))
        box(zone,'Bronze',(x-.3,y+h/2,zz),(.15,h,.08))
    for yy in [y,y+h]: box(zone,'DarkStone',(x-.1,yy,z),(.3,.35,w+.5))
    box(zone,'Ivory',(x-.15,y+h/2,z),(.2,h,.16))
    box(zone,'WarmLight',(x-.32,y-.5,z),(.06,.1,w*.7))
def stairs(zone,x,z,width=7,steps=16,rise=.22,run=.45,base=FLOOR,direction=-1):
    for i in range(steps):
        hh=(i+1)*rise
        box(zone,'Limestone',(x,base+hh/2,z+direction*(i+.5)*run),(width,hh,run+.01),True)
        box(zone,'Ivory',(x,base+hh+.015,z+direction*(i+.08)*run),(width,.03,.09))
def marker(name,p):
    o=bpy.data.objects.new(name,None); bpy.data.collections['EDITABLE_MARKERS'].objects.link(o); o.location=coord(p)
    markers[name]=list(p)
# Grand hall: uninterrupted ceremonial axis, two rows of towering columns,
# burgundy medallions and square floor motifs observed in the references.
floor('Hall',50,82,32,108)
for x in [52.5,79.5]:
    for z in range(38,105,10): column('Hall',x,z)
for z in range(40,108,16):
    cylinder('Hall','Burgundy',66,z,3.3,FLOOR+.015,.025,64)
    ring('Hall','Bronze',66,z,3.3,3.47,FLOOR+.043)
box('Hall','Burgundy',(66,4.012,72),(1.8,.018,70))
for x in [57,75]:
    for z in range(38,108,8):
        box('Hall','DarkStone',(x,4.02,z),(2.6,.02,3))
        box('Hall','Ivory',(x,4.04,z),(1.9,.02,2.3))
        box('Hall','Burgundy',(x,4.06,z),(1.6,.02,2.0))
# Long walls broken only at original connecting passages.
for x in [50,82]:
    for a,b in [(32,44),(50,74),(80,98),(104,108)]: wall_x('Hall',x,a,b)
    for a,b in [(44,50),(74,80),(98,104)]:
        box('Hall','Limestone',(x,23,(a+b)/2),(1,22,b-a),True)
    for z in [37,57,67,87,97]: window_x('Hall',x+(-.53 if x==82 else .53),z,5)
    for z in range(34,108,4):
        box('Hall','Ivory',(x+(-.7 if x==82 else .7),19,z),(.35,27,.24))
    box('Hall','DarkStone',(x,32,70),(2,1.1,76))
wall_z('Hall',108,50,82,door=(62,70))
for a,b in [(50,59),(73,82)]: wall_z('Hall',32,a,b)
box('Hall','Limestone',(66,28,32),(14,8,1),True)
for x in [59,73]: box('Hall','Bronze',(x,14,32.7),(.28,20,.2))
# Coffered ceiling with warm narrow illumination, low cost emissive geometry.
box('Hall','DarkStone',(66,33,70),(32,1,76),True)
for z in range(34,108,8):
    box('Hall','Limestone',(66,32.4,z),(32,.7,.6))
    box('Hall','Burgundy',(66,32.3,z+3),(10,.12,4))
for x in [59,73]: box('Hall','WarmLight',(x,32.1,70),(.22,.06,76))
# Raised northern apse, intact monumental portal and medallion.
floor('Apse',50,82,19,32)
wall_x('Apse',50,19,32); wall_x('Apse',82,19,32); wall_z('Apse',19,50,82)
stairs('Apse',66,32,14,12,.24,.45)
box('Apse','Burgundy',(66,5.44,23.2),(14,2.88,6.8),True)
for x in [56,76]: column('Apse',x,24,25,1)
box('Apse','DarkStone',(66,15,19.55),(8,18,.22))
for x in [62.2,69.8]: box('Apse','Bronze',(x,15,19.72),(.25,18,.14))
for i in range(6):
    box('Apse','Bronze',(66,9+i*2,19.75),(5-i*.5,.12,.1))
box('Apse','WarmLight',(66,24,19.85),(4,.2,.1))
box('Apse','DarkStone',(66,33,25.5),(32,1,13))
# Symmetric intact stairs and upper side galleries, seen in the hall reference.
for x in [55.5,76.5]:
    stairs('Gallery',x,66,7,16,.22,.5)
    floor('Gallery',x-3.5,x+3.5,33,58,y=7.52)
    box('Gallery','DarkStone',(x,5.56,45.5),(7,3.12,25),True)
    for z in range(34,58,3):
        box('Gallery','Bronze',(x+(3.25 if x<66 else -3.25),8,z),(.14,1,.14),True)
    box('Gallery','Bronze',(x+(3.25 if x<66 else -3.25),8.5,45.5),(.2,.15,25),True)
# Perimeter corridors; open ends connect the southern transverse aisle.
for zone,x0,x1 in [('West',40,50),('East',82,92)]:
    floor(zone,x0,x1,32,118)
    outer=x0 if zone=='West' else x1
    doors=[(40,52),(72,84)] if zone=='West' else [(42,54),(72,84)]
    for a,b in [(32,40 if zone=='West' else 42),(52 if zone=='West' else 54,72),(84,108)]: wall_x(zone,outer,a,b,h=12)
    for a,b in doors: box(zone,'Limestone',(outer,13,(a+b)/2),(1,6,b-a),True)
    wall_z(zone,32,x0,x1,h=12)
    box(zone,'Burgundy',((x0+x1)/2,4.015,75),(2,.025,86))
    for z in range(36,118,8):
        for x in [x0+1,x1-1]: column(zone,x,z,11,.34)
        cylinder(zone,'Ivory',(x0+x1)/2,z,1.25,4.02,.02,32)
        box(zone,'Limestone',((x0+x1)/2,15.5,z),(x1-x0,.5,.4))
    box(zone,'DarkStone',((x0+x1)/2,16,75),(x1-x0,1,86))
    box(zone,'WarmLight',((x0+x1)/2,15.4,75),(.15,.08,86))
floor('Cross',40,104,108,118)
wall_z('Cross',118,40,104,h=12,door=(62,70))
wall_z('Cross',108,92,104,h=12)
wall_x('Cross',40,108,118,h=12)
box('Cross','DarkStone',(72,16,113),(64,1,10))
box('Cross','Burgundy',(72,4.02,113),(62,.03,2))
for x in range(44,104,8): column('Cross',x,109.5,11,.35)
# Circular chambers on west side. Door east; perimeter framed city windows.
def round_room(zone,x,z,r,height=13,council=False):
    cylinder(zone,'Floor',x,z,r,3.4,.6,64,True)
    ring(zone,'Burgundy',x,z,r-2.4,r-.8,4.02)
    ring(zone,'Bronze',x,z,r-2.55,r-2.4,4.025)
    n=24
    for i in range(n):
        a=(i+.5)*2*math.pi/n
        if min(abs(a),abs(a-2*math.pi))<.42: continue
        px,pz=x+math.cos(a)*r,z+math.sin(a)*r
        box(zone,'DarkStone',(px,4+height/2,pz),(r*2*math.sin(math.pi/n)+.1,height,.5),True,angle=a+math.pi/2)
        box(zone,'Window',(px-math.cos(a)*.28,11,pz-math.sin(a)*.28),(r*2*math.sin(math.pi/n)-.45,10,.05),angle=a+math.pi/2)
        column(zone,x+math.cos(a)*(r-.6),z+math.sin(a)*(r-.6),height-.5,.32)
        box(zone,'WarmLight',(px-math.cos(a)*.35,4.4,pz-math.sin(a)*.35),(1.2,.1,.06),angle=a+math.pi/2)
        if council and i%2==0:
            xx,zz=x+math.cos(a)*(r-3),z+math.sin(a)*(r-3)
            box(zone,'Burgundy',(xx,4.7,zz),(1.1,1.4,1.1),True,angle=a)
            box(zone,'Ivory',(xx+math.cos(a)*.5,5.5,zz+math.sin(a)*.5),(.3,1.2,1.3),True,angle=a)
    cylinder(zone,'DarkStone',x,z,r,4+height,.6,64)
    ring(zone,'Bronze',x,z,r*.35,r*.5,4.03)
    cylinder(zone,'Burgundy',x,z,r*.35,4.02,.025,64)
    if council:
        cylinder(zone,'Bronze',x,z,3.6,4.05,.12,64)
        cylinder(zone,'BlueLight',x,z,.48,4.17,.1,32)
        for i in range(12):
            a=i*math.pi/6
            box(zone,'Ivory',(x+math.cos(a)*2.4,4.2,z+math.sin(a)*2.4),(.14,.06,1.7),angle=a-math.pi/2)
round_room('Council',27,46,13,15,True)
round_room('Meditation',29,78,11,13)
# Southern circular lobby connected through a short neck.
floor('Neck',62,70,118,126)
wall_x('Neck',62,118,126,h=10); wall_x('Neck',70,118,126,h=10)
box('Neck','DarkStone',(66,14.5,122),(8,1,8))
# South room door points north: rotate completed room around its centre.
round_room('Rotunda',66,139,14,16)
for key in [('Rotunda',mat) for mat in materials] + [('Rotunda','Collision')]:
    target=colliders if key[1]=='Collision' else batches
    if key in target:
        vv,ff=target[key]
        # Blender xy rotate +90: original east opening becomes Godot north.
        target[key]=([(66-(v[1]+139),-139+(v[0]-66),v[2]) for v in vv],ff)
# East antechamber with square column layout, then archive room below it.
floor('Antechamber',92,122,38,58)
wall_x('Antechamber',122,38,58,h=15); wall_z('Antechamber',38,92,122,h=15)
wall_z('Antechamber',58,92,122,h=15,door=(108,114))
for x in [98,116]:
    for z in [42,54]: column('Antechamber',x,z,14,.6)
box('Antechamber','Burgundy',(107,4.02,48),(15,.03,10))
box('Antechamber','DarkStone',(107,19.5,48),(30,1,20))
# Connecting neck with side walls.
floor('ArchiveLink',108,114,58,64)
wall_x('ArchiveLink',108,58,64,h=10); wall_x('ArchiveLink',114,58,64,h=10)
box('ArchiveLink','DarkStone',(111,14.5,61),(6,1,6))
floor('Archive',92,128,64,100)
wall_z('Archive',64,92,128,h=16,door=(108,114)); wall_z('Archive',100,92,128,h=16)
wall_x('Archive',128,64,100,h=16)
# West library door is at z72..84, aligned with east corridor.
wall_x('Archive',92,64,72,h=16); wall_x('Archive',92,84,100,h=16)
box('Archive','Limestone',(92,15,78),(1,10,12),True)
box('Archive','DarkStone',(110,20.5,82),(36,1,36))
for x in [97,123]:
    for z in [68,78,88,97]: column('Archive',x,z,15,.5)
# Blue luminous archive stacks: racks, inset rows and irregular original glyph bars.
rng=random.Random(1701)
for x in [102,118]:
    for zc in [70,82,94]:
        box('Archive','DarkStone',(x,8,zc),(1.1,8,7),True)
        for side in [-1,1]:
            box('Archive','Archive',(x+side*.57,8,zc),(.05,7.4,6.6))
            for yy in [4.7,5.8,6.9,8,9.1,10.2,11.3]:
                box('Archive','Bronze',(x+side*.63,yy-.35,zc),(.17,.12,6.7))
                for zz in range(16):
                    box('Archive','BlueLight',(x+side*.66,yy,zc-3.0+zz*.39),(.025,.45+rng.random()*.3,.08+rng.random()*.14))
for z in [69,95]:
    cylinder('Archive','Bronze',110,z,1.5,4,.8,32,True)
    cylinder('Archive','BlueLight',110,z,.65,4.8,.04,32)
for x in [107,113]: box('Archive','WarmLight',(x,20,82),(.1,.06,36))
# Service extension: a sealed mineable entrance and an overlook that needs blocks.
floor('Service',104,128,104,118)
wall_z('Service',104,104,128,h=13); wall_z('Service',118,104,128,h=13)
wall_x('Service',128,104,118,h=13)
wall_x('Service',104,104,110,h=13); wall_x('Service',104,114,118,h=13)
box('Service','DarkStone',(104,14,112),(1,12,4),True)
box('Service','DarkStone',(116,17.5,111),(24,1,14))
# Overlook fixed floor at elevation 10; construction area below and west.
floor('Overlook',120,127,110,117,y=10)
for z in [110,117]: box('Overlook','Bronze',(124,10.7,z),(6,1.4,.2),True)
window_x('Service',127.45,112,8,6,9)
marker('SPAWN_Player',(66,4.05,103))
marker('MARKER_Secret',(124,10,113.5))
marker('EDITABLE_Entrance',(103,4,110)); marker('EDITABLE_Resource',(109,4,106))
# City behind the glass: tall tapering towers with clustered window strips.
for i in range(65):
    x=rng.choice([-1,1])*rng.uniform(40,110)+66
    z=rng.uniform(10,150); h=rng.uniform(15,65); w=rng.uniform(3,9)
    # Keep background outside all gameplay rooms.
    if 8<x<138: x=142+rng.uniform(0,40) if x>66 else -15-rng.uniform(0,40)
    box('Skyline','City',(x,h/2-12,z),(w,h,w))
    cylinder('Skyline','City',x,z,w*.45,h-12,h*.1,8,r2=w*.2)
    for yy in range(0,int(h)-12,4):
        box('Skyline','CityLights',(x-w/2-.015,yy,z),(.02,.08,w*.72))
        box('Skyline','CityLights',(x,yy,z-w/2-.015),(w*.72,.08,.02))
# Emit batched meshes, correct normals via Blender calculation, retain vertex detail.
for (zone,mat),(verts,faces) in batches.items():
    mesh=bpy.data.meshes.new(f'{zone}_{mat}'); mesh.from_pydata(verts,[],faces); mesh.update()
    if mat=='Window':
        uv=mesh.uv_layers.new(name='CityUV')
        for poly in mesh.polygons:
            coords=[mesh.vertices[mesh.loops[li].vertex_index].co for li in poly.loop_indices]
            axis=1 if abs(poly.normal.x)>abs(poly.normal.y) else 0
            hmin=min(v[axis] for v in coords); hmax=max(v[axis] for v in coords)
            vmin=min(v.z for v in coords); vmax=max(v.z for v in coords)
            for li,v in zip(poly.loop_indices,coords):
                uv.data[li].uv=((v[axis]-hmin)/max(.001,hmax-hmin),(v.z-vmin)/max(.001,vmax-vmin))
    # Low-cost baked face/height shading travels in GLB vertex colours. It
    # restores the classic renderer's shaded architectural silhouettes while
    # avoiding full PBR lighting on every web fragment.
    type_values={i.identifier for i in mesh.color_attributes.bl_rna.functions['new'].parameters['type'].enum_items}
    domain_values={i.identifier for i in mesh.color_attributes.bl_rna.functions['new'].parameters['domain'].enum_items}
    assert 'FLOAT_COLOR' in type_values and 'CORNER' in domain_values
    attr=mesh.color_attributes.new(name='BakedArchitecturalLight',type='FLOAT_COLOR',domain='CORNER')
    for poly in mesh.polygons:
        normal=poly.normal
        side=.76+.16*normal.x-.12*normal.y
        if normal.z>.5: side=.98
        elif normal.z<-.5: side=.55
        for li in poly.loop_indices:
            vertex=mesh.vertices[mesh.loops[li].vertex_index].co
            weight=side*(.82+.18*min(1,max(0,(vertex.z-FLOOR)/6)))
            if normal.z>.5: weight=side
            if mat in ['WarmLight','BlueLight','Window','CityLights']: weight=1
            attr.data[li].color=(weight,weight,weight,1)
    ob=bpy.data.objects.new(f'ENV_{zone}_{mat}',mesh)
    bpy.data.collections['BACKGROUND' if zone=='Skyline' else 'ENVIRONMENT'].objects.link(ob)
    mesh.materials.append(materials[mat])
for (zone,_),(verts,faces) in colliders.items():
    mesh=bpy.data.meshes.new(f'COL_{zone}'); mesh.from_pydata(verts,[],faces); mesh.update()
    ob=bpy.data.objects.new(f'COL_{zone}-colonly',mesh); bpy.data.collections['COLLISION'].objects.link(ob)
    ob.hide_render=True; ob.hide_set(True)
# Fixed inspection cameras (Godot positions transformed to Blender).
views={
 'entrance':((66,5.58,103),(66,12,40)),
 'grand_hall':((66,8,85),(66,12,25)),
 'council':((36,6,46),(22,6,46)),
 'hallway':((45,5.58,104),(45,8,40)),
 'archive':((110,5.58,97),(110,7,65)),
 'overlook':((124,11.58,113),(128,12.5,112)),
 'exterior':((26,6,46),(2,16,46)),
}
for name,(eye,target) in views.items():
    cam=bpy.data.cameras.new('CHECK_'+name); o=bpy.data.objects.new('CHECK_'+name,cam)
    bpy.data.collections['DEBUG'].objects.link(o); o.location=coord(eye)
    o.rotation_euler=(Vector(coord(target))-o.location).to_track_quat('-Z','Y').to_euler(); cam.lens=21
scene.camera=bpy.data.objects['CHECK_entrance']
scene.world=bpy.data.worlds.new('TempleAmbient'); scene.world.use_nodes=True
bg=next(n for n in scene.world.node_tree.nodes if n.type=='BACKGROUND'); bg.inputs[0].default_value=(.44,.48,.53,1); bg.inputs[1].default_value=.7
for name,p,power,color in [('HallKey',(66,28,70),9000,(.84,.88,1)),('ApseKey',(66,24,26),3500,(1,.84,.6)),('CouncilKey',(27,17,46),2500,(.78,.86,1)),('ArchiveKey',(110,17,82),3200,(.6,.8,1)),('WestKey',(45,14,75),2000,(.84,.88,1)),('EastKey',(87,14,75),2000,(.84,.88,1)),('ServiceKey',(116,15,111),2200,(1,.86,.68)),('MeditationKey',(29,15,78),2000,(.84,.88,1)),('RotundaKey',(66,18,139),2600,(.84,.88,1)),('AntechamberKey',(107,17,48),1800,(.84,.88,1))]:
    light=bpy.data.lights.new(name,'AREA'); light.energy=power; light.shape='DISK'; light.size=20; light.color=color
    o=bpy.data.objects.new(name,light); bpy.data.collections['LIGHTS'].objects.link(o); o.location=coord(p)
scene.render.engine='CYCLES'; scene.cycles.samples=12
scene.render.resolution_x=960; scene.render.resolution_y=540; scene.render.resolution_percentage=100
scene.unit_settings.system='METRIC'
(ROOT/'godot/assets/layout.json').write_text(json.dumps({'floor':FLOOR,'markers':markers,'rooms':{'hall':[50,82,32,108],'council':[14,40,33,59],'meditation':[18,40,67,89],'rotunda':[52,80,125,153],'archive':[92,128,64,100],'service':[104,128,104,118]}},indent=2))
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'blender/coruscant_temple.blend'))
print('TEMPLE: built',len(batches),'visual batches,',len(colliders),'collision batches')
