import sys, math, random
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from common.kit import *
random.seed(37)

def make_buildings():
    reset(); building(); export('building')
    reset(); building(10,9,5.5,True); export('workshop')
    reset()
    for x in (-2.4,2.4):
        box('Gate pier',(x,3,0),(1.1,6,1.3),'plaster',.14)
        box('Pier cap',(x,6.15,0),(1.5,.35,1.7),'pale',.08)
        box('Paint band',(x,2, .68),(1.15,.35,.08),'paint')
    box('Gate header',(0,5.8,0),(5.9,1,1.3),'plaster',.12)
    box('Inset sign',(0,5.8,.7),(3.5,.55,.08),'metal')
    export('gate')

def make_market():
    reset()
    for x in (-2.7,2.7):
        for z in (-1.6,1.6): cyl('Mast',(x,1.8,z),.06,3.6,'rust',vertices=8)
    for i in range(7):
        o=box('Canvas segment',(-2.45+i*.82,3.1,0),(.86,.06,4), 'cloth' if i%2 else 'pale')
        o.rotation_euler[1]=.05 if i%2 else -.05
    for x in (-2.7,2.7): box('Beam',(x,3.25,0),(.13,.14,4),'metal')
    box('Counter',(0,.95,-.7),(5.3,.18,.8),'metal',.04)
    for x in (-1.8,0,1.8):
        box('Cargo bin',(x,.45,-.7),(1.4,.8,.7),'paint',.05)
        box('Bin lip',(x,.87,-.7),(1.45,.12,.76),'metal')
    for x in (-1.8,0,1.8): cone('Salvage drum',(x,1.35,-.7),.26,.22,.7,'rust')
    export('stall')

def make_industrial():
    reset()
    box('Tower base',(0,.6,0),(4,1.2,4),'plaster',.1)
    for x in (-1.5,1.5):
        for z in (-1.5,1.5): beam('Tower leg',(x,1,z),(x*.3,14,z*.3),.18)
    for y in (3,6,9,12):
        for z in (-1,1): beam('Cross brace',(-1,y,z),(1,y+2,z),.10,'rust')
        box('Platform',(0,y,0),(2.6,.13,2.6),'metal')
    cyl('Antenna mast',(0,15.5,0),.1,4,'rust')
    cyl('Beacon',(0,17.6,0),.18,.3,'orange')
    export('tower')
    reset(); cyl('Tank',(0,1.8,0),1.25,3.2,'paint'); cone('Tank shoulder',(0,3.5,0),1.25,.55,.35,'metal')
    for y in (.35,1.6,3.1): cyl('Tank ring',(0,y,0),1.3,.12,'rust')
    cyl('Feed pipe',(1.8,1,0),.16,2,'rust'); box('Control box',(0,1.4,1.3),(.75,.65,.15),'metal'); box('Readout',(0,1.45,1.39),(.5,.22,.02),'blue'); export('tank')
    reset(); box('Generator',(0,1.1,0),(3.2,2.2,2.4),'metal',.15)
    for x in (-1,1): cyl('Piston',(x,2.35,0),.36,.5,'rust')
    for i in range(8): box('Cooling fin',(-1.3+i*.37,1.15,1.25),(.13,1.6,.18),'paint')
    box('Panel',(0,1,1.42),(.7,.6,.07),'rubber'); box('Amber screen',(0,1.1,1.48),(.5,.2,.02),'orange'); export('generator')
    reset(); cyl('Pipe',(0,1,0),.19,4,'rust',axis='z')
    for z in (-1.8,1.8): cyl('Pipe flange',(0,1,z),.28,.13,'metal',axis='z')
    for z in (-1.2,1.2): box('Support',(0,.45,z),(.3,.9,.3),'metal'); export('pipe')

def make_ship(wreck=False):
    reset()
    box('Hull',(0,1.4,0),(3.4,1.5,6),'paint',.3)
    cone('Cockpit',(0,2.25,-1.5),1.5,1,1.2,'metal',vertices=6)
    box('Windscreen',(0,2.3,-2.58),(1.7,.6,.06),'glass',.05)
    for x in (-1,1):
        wing=box('Swept wing',(x*2.8,1.05,.8),(3.2,.22,3.5),'pale',.12); wing.rotation_euler[2]=x*.22
        cyl('Engine',(x*2,1.5,2.3),.6,3,'metal',axis='z')
        cyl('Nozzle',(x*2,1.5,3.85),.52,.22,'rubber',axis='z')
        cyl('Thrust core',(x*2,1.5,3.99),.28,.06,'orange',axis='z')
        box('Landing skid',(x*1.8,.2,.2),(.28,.25,4),'metal',.04)
        beam('Landing strut',(x*1.2,1,0),(x*1.8,.2,0),.2,'rust')
        box('Wing stripe',(x*3.1,1.18,.8),(.45,.04,3),'cloth')
    box('Tail fin',(0,2.55,2.1),(.24,1.8,1.6),'pale',.06)
    box('Repair hatch',(1.73,1.45,.8),(.08,.8,1),'rust',.04)
    if wreck:
        for o in list(bpy.context.scene.objects):
            if 'Swept wing' in o.name and o.location.x>0: bpy.data.objects.remove(o,do_unlink=True)
        for i in range(8): box('Broken panel',(random.uniform(-4,4),.15,random.uniform(-4,4)),(.7,.15,1),'rust')
    export('wreck' if wreck else 'ship')

def make_props():
    reset(); box('Crate',(0,.55,0),(1.3,1.1,1.1),'rust',.05)
    for x in (-.43,.43): box('Crate strap',(x,.55,0),(.10,1.14,1.15),'metal')
    box('Cargo label',(0,.65,.57),(.4,.25,.02),'pale'); export('crate')
    reset(); cyl('Barrel',(0,.65,0),.45,1.3,'rust');
    for y in (.12,.65,1.18): cyl('Barrel band',(0,y,0),.47,.08,'metal')
    export('barrel')
    reset()
    for i in range(5):
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=1,location=loc((random.uniform(-1.5,1.5),random.uniform(.3,.8),random.uniform(-1,1))))
        o=bpy.context.object; o.scale=(random.uniform(.7,1.6),random.uniform(.7,1.3),random.uniform(.6,1.5)); finish(o,'Eroded rock','sand')
    export('rock')
    reset()
    # Broad stratified mesas: irregular rings, ledges and flat eroded caps.
    verts=[]; faces=[]; n=10
    for level,(height,radius) in enumerate([(0,2.4),(.8,2.0),(1.1,2.2),(2.5,1.9),(2.8,2.0),(4,1.4)]):
        for j in range(n):
            a=j*math.tau/n; r=radius*(1+random.uniform(-.12,.12))
            verts.append(loc((math.cos(a)*r,height+random.uniform(-.08,.08),math.sin(a)*r)))
    for level in range(5):
        for j in range(n): faces.append((level*n+j,level*n+(j+1)%n,(level+1)*n+(j+1)%n,(level+1)*n+j))
    faces.append(tuple(range(50,60)))
    mesh=bpy.data.meshes.new('Stratified sandstone'); mesh.from_pydata(verts,[],faces); mesh.update(); o=bpy.data.objects.new('Eroded mesa',mesh); bpy.context.collection.objects.link(o); finish(o,'Cliff ledges','sand')
    bpy.context.view_layer.objects.active=o; o.select_set(True); bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.mesh.normals_make_consistent(inside=False); bpy.ops.uv.smart_project(island_margin=.03); bpy.ops.object.mode_set(mode='OBJECT')
    export('cliff')
    reset(); cyl('Robot body',(0,.75,0),.35,.9,'paint'); box('Robot head',(0,1.35,0),(.7,.35,.45),'pale',.08)
    box('Eye bar',(0,1.38,.24),(.52,.10,.03),'rubber')
    for x in (-.16,.16): box('Optic',(x,1.38,.26),(.10,.065,.02),'blue')
    for x in (-.42,.42): cyl('Wheel',(x,.26,0),.25,.16,'rubber',axis='x'); beam('Arm',(x,.95,0),(x*1.5,.55,.15),.08,'rust')
    cyl('Aerial',(.2,1.7,0),.015,.5,'metal',vertices=6); export('robot')
    reset(); cyl('Power cell',(0,.22,0),.16,.44,'metal'); cyl('Power band',(0,.23,0),.17,.18,'blue'); export('power_cell')
    reset(); box('Navigation core',(0,.18,0),(.5,.35,.35),'metal',.03); box('Navigation display',(0,.25,.19),(.35,.12,.02),'blue'); export('navigation_module')
    reset(); cyl('Coolant',(0,.26,0),.22,.5,'paint'); cyl('Coolant cap',(0,.55,0),.10,.1,'orange'); export('coolant_unit')

make_buildings(); make_market(); make_industrial(); make_ship(); make_ship(True); make_props()
