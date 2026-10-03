class_name OutpostWorld
extends Node3D
var assets: Dictionary = {}
var kit_materials: Dictionary = {}
var materials: Dictionary = {}
var rotating: Array[Node3D] = []
var lights: Array[MeshInstance3D] = []
var ship: Node3D
var ship_body: StaticBody3D
var ship_target: OutpostInteractable
var robot: OutpostRobot
var parts: Dictionary = {}
var door: OutpostInteractable
var generator: OutpostInteractable
var generator_label: Label3D
var generator_fan: Node3D
var relay_beacon: MeshInstance3D
var time := 0.0
var landmarks := {"Landing pad": Vector3(0,0,22), "Salvage market": Vector3(-12,0,-4), "Relay tower": Vector3(19,0,-8), "Workshop": Vector3(12,0,-22), "Old wreck": Vector3(0,0,-51), "Canyon overlook": Vector3(0,0,-67)}
signal interacted(target)

func mat(id: String, color: Color, emission: bool = false) -> StandardMaterial3D:
	if materials.has(id): return materials[id]
	var m := StandardMaterial3D.new()
	m.albedo_color = color
	m.roughness = 0.9
	if emission:
		m.emission_enabled = true
		m.emission = color
		m.emission_energy_multiplier = 2
	materials[id] = m
	return m

func asset(id: String, p: Vector3, scale_value: Vector3 = Vector3.ONE, angle: float = 0.0) -> Node3D:
	if not assets.has(id): assets[id] = load("res://assets/generated/%s.glb" % id)
	var instance: Node3D = assets[id].instantiate()
	instance.position = p
	instance.scale = scale_value
	instance.rotation.y = angle
	share_kit_materials(instance)
	add_child(instance)
	return instance

func share_kit_materials(node: Node) -> void:
	if node is MeshInstance3D:
		for surface in range(node.mesh.get_surface_count()):
			var imported: Material = node.get_active_material(surface)
			if imported and not imported.resource_name.is_empty():
				# Blender appends .001 etc. to the same palette names across builds.
				var key := imported.resource_name.get_slice(".",0)
				if not kit_materials.has(key): kit_materials[key] = imported
				node.set_surface_override_material(surface,kit_materials[key])
	for child in node.get_children(): share_kit_materials(child)

func collision(p: Vector3, size: Vector3, parent: Node3D = self) -> StaticBody3D:
	var body := StaticBody3D.new()
	body.position = p
	var shape := CollisionShape3D.new()
	var box := BoxShape3D.new()
	box.size = size
	shape.shape = box
	body.add_child(shape)
	parent.add_child(body)
	return body

func block(p: Vector3, size: Vector3, material: Material, solid: bool = true) -> MeshInstance3D:
	var mesh := MeshInstance3D.new()
	var box := BoxMesh.new()
	box.size = size
	mesh.mesh = box
	mesh.material_override = material
	mesh.position = p
	add_child(mesh)
	if solid: collision(p, size)
	return mesh

func cylinder(p: Vector3, radius: float, height: float, material: Material) -> MeshInstance3D:
	var mesh := MeshInstance3D.new()
	var c := CylinderMesh.new()
	c.top_radius = radius
	c.bottom_radius = radius
	c.height = height
	c.radial_segments = 32
	mesh.mesh = c
	mesh.position = p
	mesh.material_override = material
	add_child(mesh)
	return mesh

func sign_text(text: String, p: Vector3, size: int = 48, color: Color = Color("e9cfa7"), angle: float = 0.0) -> Label3D:
	var label := Label3D.new()
	label.text = text
	label.position = p
	label.font_size = size
	label.pixel_size = .012
	label.modulate = color
	label.outline_size = 4
	label.outline_modulate = Color("252b2b")
	label.rotation.y = angle
	add_child(label)
	return label

func make_interactable(kind: String, title: String, p: Vector3, size: Vector3) -> OutpostInteractable:
	var item := OutpostInteractable.new()
	item.setup(kind,title,size)
	item.position = p
	item.used.connect(func(target): interacted.emit(target))
	add_child(item)
	return item

func shell_collision(p: Vector3, width: float, depth: float, height: float, interior: bool = false) -> void:
	if not interior:
		collision(p + Vector3(0,height/2,0),Vector3(width,height,depth))
		return
	collision(p+Vector3(0,height/2,-depth/2),Vector3(width,height,.5))
	for x in [-width/2,width/2]: collision(p+Vector3(x,height/2,0),Vector3(.5,height,depth))
	for x in [-1,1]: collision(p+Vector3(x*(width/4+.65),height/2,depth/2),Vector3(width/2-1.3,height,.5))
	collision(p+Vector3(0,height-.8,depth/2),Vector3(2.7,1.6,.5))
	# Accessible gently sloped threshold, no jump needed.
	var ramp_size := Vector3(2.5,.14,2.4)
	var ramp := block(p+Vector3(0,.12,depth/2+.9),ramp_size,mat("threshold",Color("7d6552")),false)
	ramp.rotation.x = .22
	collision(Vector3.ZERO,ramp_size,ramp)
	# Floor height matches the asset and the ramp uses the same transform.
	collision(p+Vector3(0,.2,0),Vector3(width-.5,.4,depth-.5))

func build() -> void:
	var sand := mat("sand",Color("a08565"))
	var stone := mat("stone",Color("987452"))
	var dark := mat("dark",Color("283638"))
	var rust := mat("rust",Color("704532"))
	var glow := mat("glow",Color("efaf5c"),true)
	var env := WorldEnvironment.new()
	var environment := Environment.new()
	environment.background_mode = Environment.BG_SKY
	var sky := Sky.new()
	var sky_mat := ProceduralSkyMaterial.new()
	sky_mat.sky_top_color = Color("436b7e")
	sky_mat.sky_horizon_color = Color("d9bc93")
	sky_mat.ground_bottom_color = Color("87745b")
	sky_mat.ground_horizon_color = Color("d9bc93")
	sky_mat.sky_curve = .2
	sky.sky_material = sky_mat
	environment.sky = sky
	environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environment.ambient_light_color = Color("b6c6ce")
	environment.ambient_light_energy = .4
	environment.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	environment.fog_enabled = true
	environment.fog_light_color = Color("c9b28d")
	environment.fog_density = .0035
	env.environment = environment
	add_child(env)
	var sun := DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-32,-40,0)
	sun.light_color = Color("fff2df")
	sun.light_energy = .8
	sun.shadow_enabled = true
	sun.directional_shadow_max_distance = 65
	add_child(sun)
	block(Vector3(0,-.55,-15),Vector3(150,1,150),sand)
	# Landing pad stays level with the walking surface.
	cylinder(Vector3(0,-.035,22),8,.12,dark)
	for i in range(12):
		var a := i*TAU/12
		var marker := block(Vector3(sin(a)*7.1,.05,22+cos(a)*7.1),Vector3(.15,.04,1.0),glow,false)
		marker.rotation.y = a
	ship = asset("ship",Vector3(0,0,23))
	ship_body = collision(Vector3(0,1.2,23),Vector3(3.4,2.4,6))
	ship_target = make_interactable("ship","Ship",Vector3(2.0,1.5,23.8),Vector3(.5,1.2,1.5))
	ship_body.set_meta("interactable",ship_target)
	sign_text("WAYFARER / 07",Vector3(0,.15,17),34)
	# Plaza paving, worn route strips, and gate establish the arrival view.
	block(Vector3(0,-.02,-4),Vector3(20,.06,22),mat("pavers",Color("a88761")),false)
	for z in range(-13,14,3):
		for x in [-3,3]: block(Vector3(x,.015,z),Vector3(.12,.03,1.6),rust,false)
	asset("gate",Vector3(0,0,7))
	for x in [-2.4,2.4]: collision(Vector3(x,3,7),Vector3(1.1,6,1.3))
	sign_text("D U S T F A L L",Vector3(0,5.8,7.78),42)
	sign_text("TRADING POST  /  SECTOR 09",Vector3(0,4.9,7.78),20)
	# Buildings encircle rather than fill the plaza.
	for entry in [Vector3(-15,0,-15),Vector3(-15,0,7),Vector3(15,0,7),Vector3(24,0,-20)]:
		asset("building",entry)
		shell_collision(entry,8,7,5)
	sign_text("THE LAST LIGHT",Vector3(15,4,10.9),31)
	sign_text("CARGO / 09",Vector3(-15,4,10.9),32)
	asset("stall",Vector3(-12,0,-3))
	asset("stall",Vector3(-12,0,-9))
	for z in [-3,-9]:
		collision(Vector3(-12,.65,z-.7),Vector3(5.3,1.3,.8))
		for x in [-14.7,-9.3]: collision(Vector3(x,1.7,z+1.6),Vector3(.15,3.4,.15))
	sign_text("SALVAGE & SUPPLY",Vector3(-12,3.65,-1),31)
	block(Vector3(-12,1.1,-1.1),Vector3(.8,.18,.8),dark)
	add_part("power_cell","Power cell",Vector3(-12,1.21,-1.1))
	# Workshop with an actual interior and a sliding door.
	var workshop_pos := Vector3(12,0,-22)
	asset("workshop",workshop_pos)
	shell_collision(workshop_pos,10,9,5.5,true)
	sign_text("REPAIR / RECLAIM",Vector3(12,4.5,-17.1),36)
	door = make_interactable("door","Workshop",Vector3(13.5,1.5,-16.9),Vector3(.5,.9,.3))
	block(Vector3(13.5,1.5,-16.94),Vector3(.48,.8,.12),dark,false)
	block(Vector3(13.5,1.6,-16.86),Vector3(.2,.18,.02),mat("door_button",Color("66cfbf"),true),false)
	var door_mesh := block(Vector3.ZERO,Vector3(2.3,3.6,.18),mat("door",Color("385858")),false)
	var sliding_body := collision(Vector3(12,1.8,-17.15),Vector3(2.35,3.6,.2))
	remove_child(door_mesh)
	sliding_body.add_child(door_mesh)
	door_mesh.position = Vector3.ZERO
	door.visual = sliding_body
	sliding_body.set_meta("interactable",door)
	add_part("navigation_module","Navigation module",Vector3(9.3,1.1,-22))
	for z in [-24,-21]: asset("crate",Vector3(15,.45,z))
	block(Vector3(14.5,3,-26.2),Vector3(2.4,1,.1),dark,false)
	for x in [13.6,14.1,14.6,15.1]: block(Vector3(x,3,-26.1),Vector3(.15,.7,.08),rust,false)
	asset("barrel",Vector3(8,.45,-25))
	var lamp := OmniLight3D.new()
	lamp.position = Vector3(12,4,-22)
	lamp.light_color = Color("ffd29a")
	lamp.light_energy = 2.0
	lamp.omni_range = 8
	lamp.shadow_enabled = false
	add_child(lamp)
	block(Vector3(12,4.8,-22),Vector3(2,.08,.25),glow,false)
	# Right-side alley links the market square to the canyon route.
	asset("tower",Vector3(19,0,-7))
	collision(Vector3(19,.6,-7),Vector3(4,1.2,4))
	var antenna := Node3D.new()
	antenna.position = Vector3(19,15.5,-7)
	add_child(antenna)
	for x in [-1,1]:
		var blade := block(Vector3.ZERO,Vector3(3,.1,.1),dark,false)
		remove_child(blade)
		antenna.add_child(blade)
		blade.position.x = x*1.5
	rotating.append(antenna)
	relay_beacon = cylinder(Vector3(19,17.9,-7),.18,.25,glow)
	for p in [Vector3(19,0,-14),Vector3(22,0,-14),Vector3(-20,0,-22)]:
		asset("tank",p)
		collision(p+Vector3(0,1.8,0),Vector3(2.5,3.6,2.5))
	asset("generator",Vector3(5,0,-11))
	var generator_body := collision(Vector3(5,1.1,-11),Vector3(3.2,2.2,2.4))
	generator = make_interactable("generator","Generator",Vector3(5,1,-9.45),Vector3(.9,.8,.2))
	generator_body.set_meta("interactable",generator)
	generator_label = sign_text("GRID OFFLINE",Vector3(5,2.8,-9.5),23)
	var fan_back := cylinder(Vector3(6.64,1.15,-11),.6,.08,dark)
	fan_back.rotation.z = PI/2
	generator_fan = Node3D.new()
	generator_fan.position = Vector3(6.7,1.15,-11)
	add_child(generator_fan)
	for angle in [0.0,PI/2]:
		var blade := block(Vector3.ZERO,Vector3(.06,.13,1.0),rust,false)
		remove_child(blade)
		generator_fan.add_child(blade)
		blade.rotation.x = angle
	for z in [-9,-13,-17]: asset("pipe",Vector3(23,0,z))
	# Deliberate cargo clusters rather than evenly scattered clutter.
	for p in [Vector3(-7,0,3),Vector3(-6,0,3.3),Vector3(-7,1.1,3),Vector3(8,0,6),Vector3(9.5,0,6),Vector3(21,0,-25),Vector3(-9,0,-18)]:
		asset("crate",p)
		collision(p+Vector3(0,.55,0),Vector3(1.3,1.1,1.1))
	for p in [Vector3(-8,0,2),Vector3(9,0,4.7),Vector3(-19,0,-7),Vector3(7,0,-28)]:
		asset("barrel",p)
		collision(p+Vector3(0,.65,0),Vector3(.9,1.3,.9))
	# Cliff silhouettes frame a navigable canyon, not a flat empty desert.
	var rng := RandomNumberGenerator.new()
	rng.seed = 37
	for side in [-1,1]:
		for i in range(9):
			var z := -34.0-i*5.5
			var x: float = side*(10.5+sin(i*.6)*2)
			var rock_scale := Vector3(rng.randf_range(1.2,1.8),rng.randf_range(1.7,3.1),rng.randf_range(1.1,1.8))
			asset("cliff",Vector3(x,-.6,z),rock_scale,rng.randf_range(0,TAU))
			collision(Vector3(x,3,z),Vector3(5,6,5))
	for i in range(32):
		var angle := i*TAU/32
		if sin(angle) < -.8 and absf(cos(angle)) < .3: continue
		asset("cliff",Vector3(cos(angle)*55,-.5,-15+sin(angle)*61),Vector3(3,3+rng.randf()*3,3),angle)
	# Low rocks guide turns without blocking the route.
	for p in [Vector3(-5,0,-30),Vector3(5,0,-39),Vector3(-6,0,-58)]: asset("rock",p,Vector3(1.5,.8,1.4))
	var wreck := asset("wreck",Vector3(-1,.3,-51),Vector3.ONE,-.35)
	wreck.rotation.z = -.18
	collision(Vector3(-1,1,-51),Vector3(3.4,2,5))
	block(Vector3(2.8,.35,-49.5),Vector3(1.5,.7,1),rust)
	add_part("coolant_unit","Coolant unit",Vector3(2.8,.73,-49.5))
	sign_text("SURVEY WRECK / 04",Vector3(3,1.8,-47.5),22)
	# Overlook, railing, and distant industrial ruins.
	block(Vector3(0,.015,-67),Vector3(9,.13,7),dark,false)
	for x in [-4.3,4.3]:
		block(Vector3(x,.55,-67),Vector3(.12,1.1,7),rust)
	collision(Vector3(0,.55,-70.3),Vector3(8.6,1.1,.12))
	block(Vector3(0,1.05,-70.3),Vector3(8.6,.12,.12),rust,false)
	for x in [-4,-2,0,2,4]: block(Vector3(x,.52,-70.3),Vector3(.12,1.05,.12),rust,false)
	block(Vector3(0,1.3,-70.25),Vector3(4,.55,.08),dark,false)
	sign_text("THE SILENT REACH",Vector3(0,1.3,-70.18),24)
	for x in [-34,25,40]:
		var y := 20.0 if x == 25 else 12.0
		block(Vector3(x,(y-12)/2,-116),Vector3(5,y+12,5),stone,false)
		block(Vector3(x,y,-116),Vector3(12,1,8),dark,false)
	block(Vector3(32.5,16,-116),Vector3(24,1.5,8),dark,false)
	# A central extraction gantry gives the overlook a strong destination silhouette.
	for x in [-8,8]:
		block(Vector3(x,3,-114),Vector3(4,30,5),stone,false)
		block(Vector3(x,19,-114),Vector3(6,1,8),dark,false)
		block(Vector3(x,23,-114),Vector3(.3,7,.3),rust,false)
	block(Vector3(0,18,-114),Vector3(23,2,9),dark,false)
	block(Vector3(0,10,-114),Vector3(6,12,4),rust,false)
	block(Vector3(0,-12,-125),Vector3(160,1,100),sand,false)
	# Invisible perimeter avoids getting lost outside the composed space.
	for x in [-42,42]: collision(Vector3(x,5,-18),Vector3(1,10,120))
	collision(Vector3(0,5,39),Vector3(85,10,1))
	collision(Vector3(0,5,-72),Vector3(85,10,1))
	robot = OutpostRobot.new()
	robot.position = Vector3(4,0,-2)
	var robot_visual := asset("robot",Vector3.ZERO)
	remove_child(robot_visual)
	robot.add_child(robot_visual)
	add_child(robot)
	# A small overhead courier crosses the sky, no vehicle gameplay.
	var courier := asset("ship",Vector3(-80,32,-80),Vector3(.45,.45,.45))
	courier.name = "SkyCourier"
	# Slow dust motes, built from a single low-cost particle system.
	var dust := CPUParticles3D.new()
	dust.amount = 60
	dust.lifetime = 10
	dust.preprocess = 10
	dust.emission_shape = CPUParticles3D.EMISSION_SHAPE_BOX
	dust.emission_box_extents = Vector3(25,3,40)
	dust.position = Vector3(0,2,-15)
	dust.direction = Vector3(1,.05,0)
	dust.spread = 8
	dust.initial_velocity_min = .3
	dust.initial_velocity_max = .8
	dust.gravity = Vector3.ZERO
	dust.scale_amount_min = .015
	dust.scale_amount_max = .045
	var mote := SphereMesh.new()
	mote.radius = .3
	mote.height = .6
	mote.radial_segments = 4
	mote.rings = 2
	mote.material = mat("dust",Color("dcc9a6"))
	dust.mesh = mote
	add_child(dust)

func add_part(id: String, title: String, p: Vector3) -> void:
	var target := make_interactable("part",title,p+Vector3(0,.25,0),Vector3(.65,.7,.65))
	target.part_id = id
	var model := asset(id,Vector3.ZERO)
	remove_child(model)
	target.add_child(model)
	model.position.y = -.25
	target.visual = model
	parts[id] = target
	var glow := mat("part_glow",Color("5cdee0"),true)
	var ring := cylinder(p-Vector3(0,.015,0),.4,.03,glow)
	ring.name = id+"_ring"

func _process(delta: float) -> void:
	time += delta
	if generator_fan: generator_fan.rotation.x += delta*(5.0 if generator.opened else 1.0)
	if relay_beacon: relay_beacon.visible = fmod(time,2.8) < .35
	for thing in rotating: thing.rotation.y += delta*.3
	for part in parts.values():
		if part.available: part.visual.rotation.y += delta*.7
	var courier := get_node_or_null("SkyCourier") as Node3D
	if courier: courier.position.x = fmod(time*3,180)-90
