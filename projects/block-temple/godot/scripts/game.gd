extends Node3D

var world: TempleVoxels
var player: CharacterBody3D
var camera: Camera3D
var architecture: Node3D
var inventory = 0
var discovered = false
var completed = false
var room = "Grand Hall"
var layout: Dictionary
var visual_zones: Dictionary = {}
var input_ms = 0.0
var target_ms = 0.0
var publish_ms = 0.0
var quality_mode = 1.0
var selection: MeshInstance3D
var active = false
var loading = true
var selected = 1
var yaw = 0.0
var pitch = -0.12
var move_input = Vector2.ZERO
var jump_requested = false
var saved: Dictionary = {}
var seed_value = 1701
var save_timer = 0.0
var status_timer = 0.0
var edit_cooldown = 0.0
var hit: Dictionary = {}
var edits = 0
var placed = 0
var broken = 0
var message = ""
var message_timer = 0.0
var bridge = false
var action_pending: Array = []
var chunk_queue: Array[Vector2i] = []

func _ready() -> void:
	bridge = OS.has_feature("web")
	world = TempleVoxels.new()
	add_child(world)
	load_save()
	world.generate(seed_value)
	world.apply_changes(saved.get("changes",{}) if saved.get("changes",{}) is Dictionary else {})
	chunk_queue.append(Vector2i(6,6))
	chunk_queue.append(Vector2i(7,6))
	chunk_queue.append(Vector2i(6,7))
	chunk_queue.append(Vector2i(7,7))
	setup_scene()
	publish({"loading":true,"progress":0})

func setup_scene() -> void:
	var env = WorldEnvironment.new()
	var e = Environment.new()
	e.background_mode = Environment.BG_COLOR
	e.background_color = Color("8297a9")
	e.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	e.ambient_light_color = Color("dae1ea")
	e.ambient_light_energy = 0.85
	e.tonemap_mode = Environment.TONE_MAPPER_LINEAR
	e.fog_enabled = true
	e.fog_light_color = Color("8297a9")
	e.fog_density = 0.0015
	env.environment = e
	add_child(env)
	var sun = DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-55,-30,0)
	sun.light_color = Color("e5e3dc")
	sun.light_energy = 0.65
	sun.shadow_enabled = false
	add_child(sun)
	layout = JSON.parse_string(FileAccess.get_file_as_string("res://assets/layout.json"))
	architecture = load("res://assets/coruscant_temple.glb").instantiate()
	add_child(architecture)
	configure_architecture(architecture)
	player = CharacterBody3D.new()
	player.collision_layer = 2
	player.collision_mask = 5
	player.floor_snap_length = 0.25
	add_child(player)
	var shape = CollisionShape3D.new()
	var capsule = CapsuleShape3D.new()
	capsule.radius = 0.28
	capsule.height = 1.75
	shape.shape = capsule
	shape.position.y = 0.875
	player.add_child(shape)
	camera = Camera3D.new()
	camera.position.y = 1.58
	camera.fov = 72
	camera.far = 260
	camera.current = true
	player.add_child(camera)
	selection = MeshInstance3D.new()
	var box = BoxMesh.new()
	box.size = Vector3(1.012,1.012,1.012)
	selection.mesh = box
	var mat = StandardMaterial3D.new()
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.albedo_color = Color(1,0.95,0.65,0.14)
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	selection.material_override = mat
	selection.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(selection)
	add_sign("SERVICE ACCESS\nMine the cracked blocks",Vector3(102.35,6.9,112),-PI/2)
	add_sign("ARCHIVES",Vector3(91.3,7,78),-PI/2)
	add_sign("COUNCIL CHAMBER",Vector3(40.7,7,46),PI/2)
	add_sign("RESTORATION STOCK\nRecover blocks · build a route",Vector3(111,8.4,104.6),0)
	add_sign("CITY OVERLOOK",Vector3(123.5,12.3,117.1),PI)

func configure_architecture(node: Node) -> void:
	if node is StaticBody3D:
		node.collision_layer = 1
		node.collision_mask = 0
	if node is MeshInstance3D:
		var parts = str(node.name).split("_")
		if parts.size()>1:
			var zone = str(parts[1])
			if not visual_zones.has(zone): visual_zones[zone] = []
			visual_zones[zone].append(node)
		node.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		for surface in node.mesh.get_surface_count():
			var material = node.mesh.surface_get_material(surface)
			if material is StandardMaterial3D:
				material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
				material.vertex_color_use_as_albedo = true
	for child in node.get_children(): configure_architecture(child)

func add_sign(text: String, pos: Vector3, rotation_y: float) -> void:
	var sign = Label3D.new()
	sign.text = text
	sign.font_size = 32
	sign.pixel_size = 0.006
	sign.position = pos
	sign.rotation.y = rotation_y
	sign.modulate = Color("e8d2a5")
	sign.double_sided = false
	add_child(sign)

func finish_loading() -> void:
	loading = false
	inventory = clampi(int(saved.get("inventory",0)),0,10000)
	discovered = bool(saved.get("discovered",false))
	completed = bool(saved.get("completed",false))
	selected = clampi(int(saved.get("selected",1)),1,12)
	yaw = float(saved.get("yaw",0))
	pitch = clampf(float(saved.get("pitch",-0.12)),-1.45,1.45)
	var pos = saved.get("position",[])
	if pos is Array and pos.size() == 3:
		player.position = Vector3(float(pos[0]),float(pos[1]),float(pos[2]))
		if not safe_position(player.position): spawn()
	else: spawn()
	update_camera()
	update_progression()
	update_visibility()
	publish_status()

func spawn() -> void:
	player.position = Vector3(66,4.05,103)
	player.velocity = Vector3.ZERO

func safe_position(pos: Vector3) -> bool:
	if not is_finite(pos.x) or not is_finite(pos.y) or not is_finite(pos.z): return false
	if pos.y<3.9 or pos.y>25 or not world.can_build(Vector3i(floor(pos.x),4,floor(pos.z))): return false
	var shape = CapsuleShape3D.new()
	shape.height = 1.70
	shape.radius = 0.275
	var query = PhysicsShapeQueryParameters3D.new()
	query.shape = shape
	query.transform = Transform3D(Basis.IDENTITY,pos+Vector3(0,0.90,0))
	query.collision_mask = 5
	return get_world_3d().direct_space_state.intersect_shape(query,1).is_empty()

# Query static architecture separately from voxel DDA. Deferred voxel colliders
# cannot shadow freshly mined cells, and authored walls always occlude edits.
static func closest_hit(voxel: Dictionary, fixed: Dictionary) -> Dictionary:
	if voxel.is_empty(): return fixed
	if fixed.is_empty() or voxel.distance < fixed.distance-0.001: return voxel
	return fixed

func target_query(origin: Vector3, direction: Vector3) -> Dictionary:
	var voxel = world.ray(origin,direction)
	if not voxel.is_empty(): voxel["kind"] = "voxel"
	var query = PhysicsRayQueryParameters3D.create(origin,origin+direction*5.5,1)
	var fixed = get_world_3d().direct_space_state.intersect_ray(query)
	if not fixed.is_empty():
		fixed["distance"] = origin.distance_to(fixed.position)
		fixed["kind"] = "architecture"
		fixed["place"] = Vector3i((fixed.position+fixed.normal*0.01).floor())
	return closest_hit(voxel,fixed)

func can_place(p: Vector3i) -> bool:
	if not world.can_build(p) or world.get_block(p)!=0: return false
	var body = AABB(player.position+Vector3(-0.29,0.01,-0.29),Vector3(0.58,1.74,0.58))
	if body.intersects(AABB(Vector3(p),Vector3.ONE)): return false
	var shape = BoxShape3D.new()
	shape.size = Vector3.ONE*0.98
	var query = PhysicsShapeQueryParameters3D.new()
	query.shape = shape
	query.transform = Transform3D(Basis.IDENTITY,Vector3(p)+Vector3.ONE*0.5)
	query.collision_mask = 1
	return get_world_3d().direct_space_state.intersect_shape(query,1).is_empty()

func _process(dt: float) -> void:
	if loading:
		if not chunk_queue.is_empty():
			for batch in mini(4,chunk_queue.size()): world.rebuild(chunk_queue.pop_front())
			publish({"loading":true,"progress":(4-chunk_queue.size())/4.0})
		else: finish_loading()
		return
	if bridge:
		var t_input = Time.get_ticks_usec()
		read_input()
		input_ms = (Time.get_ticks_usec()-t_input)/1000.0
	if not world.dirty.is_empty(): world.rebuild(world.dirty.keys()[0])
	edit_cooldown = maxf(0,edit_cooldown-dt)
	message_timer = maxf(0,message_timer-dt)
	if active:
		var t_target = Time.get_ticks_usec()
		hit = target_query(camera.global_position,-camera.global_basis.z)
		target_ms = (Time.get_ticks_usec()-t_target)/1000.0
		selection.visible = not hit.is_empty() and hit.kind=="voxel"
		if selection.visible: selection.position = Vector3(hit.block)+Vector3.ONE*0.5
		for action in action_pending: perform(action)
	else: selection.visible = false
	action_pending.clear()
	save_timer += dt
	if save_timer > 4:
		save_timer = 0
		if active: save_world()
	status_timer += dt
	if status_timer > 0.2:
		status_timer = 0
		update_progression()
		update_visibility()
		publish_status()

func read_input() -> void:
	var encoded = JavaScriptBridge.eval("window.templeConsume ? window.templeConsume() : '{}'")
	var input = JSON.parse_string(encoded) if encoded is String else {}
	if not input is Dictionary: return
	var was_active = active
	active = bool(input.get("active",false))
	if was_active and not active: save_world()
	move_input = Vector2(float(input.get("x",0)),float(input.get("z",0)))
	yaw -= float(input.get("lookX",0))*0.004
	pitch = clampf(pitch-float(input.get("lookY",0))*0.004,-1.45,1.45)
	selected = clampi(int(input.get("selected",selected)),1,12)
	quality_mode = float(input.get("quality",1.0))
	jump_requested = jump_requested or bool(input.get("jump",false))
	action_pending.append_array(input.get("actions",[]))
	if input.get("reset",false): reset_world()
	update_camera()

func update_camera() -> void:
	player.rotation.y = yaw
	camera.rotation.x = pitch

func _physics_process(dt: float) -> void:
	if loading or not active: return
	var direction = player.basis * Vector3(move_input.x,0,move_input.y)
	direction = direction.limit_length()
	player.velocity.x = direction.x*5
	player.velocity.z = direction.z*5
	if not player.is_on_floor(): player.velocity.y -= 20*dt
	if jump_requested and player.is_on_floor(): player.velocity.y = 7.2
	jump_requested = false
	# Step over the authored 24 cm stair risers without requiring repeated jumps.
	var horizontal = Vector3(player.velocity.x,0,player.velocity.z)*dt
	if player.is_on_floor() and horizontal.length()>0.001 and player.test_move(player.global_transform,horizontal):
		var raised = player.global_transform
		raised.origin.y += 0.30
		if not player.test_move(player.global_transform,Vector3.UP*0.30) and not player.test_move(raised,horizontal):
			player.global_position.y += 0.30
	player.move_and_slide()
	if player.position.y<1 or player.position.x<0 or player.position.x>=160 or player.position.z<0 or player.position.z>=160:
		spawn()
		notify("Returned to the temple entrance.")

func update_visibility() -> void:
	# Rooms are batched by material; skip architecture hidden behind opaque walls.
	# Keep a portal's neighbour visible before crossing to avoid visible popping.
	var p = player.position
	var visible = {"Hall":true,"Apse":true,"Gallery":true}
	if p.x<56:
		visible["West"] = true
		if p.z<67: visible["Council"] = true
		if p.z>57: visible["Meditation"] = true
	if p.x>76:
		visible["East"] = true
		if p.z<70:
			visible["Antechamber"] = true
			visible["ArchiveLink"] = true
		if p.z>54 and p.z<108: visible["Archive"] = true
	if p.z>94:
		visible["Cross"] = true
		visible["West"] = true
		visible["East"] = true
	if p.z>109:
		visible["Neck"] = true
		visible["Rotunda"] = true
	if p.x>94 and p.z>98:
		visible["Service"] = true
		visible["Overlook"] = true
	for zone in visual_zones:
		for node in visual_zones[zone]: node.visible = visible.has(zone)

func perform(action: String) -> void:
	if action not in ["break","place"] or edit_cooldown>0: return
	hit = target_query(camera.global_position,-camera.global_basis.z)
	if hit.is_empty():
		notify("Aim at a nearby surface.")
		return
	if action=="break" and hit.kind!="voxel":
		notify("Permanent architecture. Mine the cracked service blocks.")
		return
	var p: Vector3i = hit.block if action=="break" else hit.place
	if action=="place":
		if inventory<=0:
			notify("Recover blocks from the service entrance first.")
			return
		if not can_place(p):
			notify("Keep the block clear of yourself and the architecture.")
			return
	var removed = world.get_block(p)
	if world.edit(p,0 if action=="break" else selected):
		edits += 1
		if action=="break":
			broken += 1
			inventory += 1
		else:
			placed += 1
			inventory -= 1
		edit_cooldown = 0.16
		sound(action)
		notify(("Recovered "+TempleVoxels.NAMES[removed]) if action=="break" else ("Placed "+TempleVoxels.NAMES[selected]))
		save_world()

func update_progression() -> void:
	var p = player.position
	room = "Grand Hall"
	if p.z<32: room = "Ceremonial Apse"
	elif p.x<40: room = "Council Chamber" if p.z<62 else "Meditation Chamber"
	elif p.z>124: room = "Southern Rotunda"
	elif p.z>117: room = "Rotunda Passage"
	elif p.x>=104 and p.z>=104: room = "Service Annex"
	elif p.x>=92 and p.z<60: room = "Antechamber"
	elif p.x>=92 and p.z<101: room = "Jedi Archives"
	elif p.z>=108: room = "Transverse Hallway"
	elif p.x<50: room = "West Hallway"
	elif p.x>82: room = "East Hallway"
	if room=="Service Annex" and not discovered:
		discovered = true
		notify("Hidden service annex found. Recover blocks and build up to the city overlook.")
		save_world()
	if p.x>120 and p.x<127 and p.z>110 and p.z<117 and p.y>=9.9 and not completed:
		completed = true
		notify("Overlook reached. The temple is yours to explore and build.")
		sound("wave")
		save_world()

func notify(text: String) -> void:
	message = text
	message_timer = 2.5

func sound(kind: String) -> void:
	if bridge: JavaScriptBridge.eval("window.templeSound && window.templeSound("+JSON.stringify(kind)+")")

func load_save() -> void:
	if not bridge: return
	var encoded = JavaScriptBridge.eval("window.templeLoad ? window.templeLoad() : '{}' ")
	var data = JSON.parse_string(encoded) if encoded is String else null
	if data is Dictionary and int(data.get("version",0)) == 2:
		saved = data
		seed_value = clampi(int(saved.get("seed",1701)),0,2147483647)

func save_world() -> void:
	if loading or not bridge: return
	var data = {"version":2,"inventory":inventory,"discovered":discovered,"completed":completed,"seed":seed_value,"changes":world.changes,"position":[player.position.x,player.position.y,player.position.z],"selected":selected,"yaw":yaw,"pitch":pitch}
	JavaScriptBridge.eval("window.templeSave("+JSON.stringify(JSON.stringify(data))+")")

func reset_world() -> void:
	active = false
	loading = true
	saved = {}
	selected = 1
	yaw = 0
	pitch = -0.12
	edits = 0
	placed = 0
	broken = 0
	hit = {}
	inventory = 0
	message = ""
	message_timer = 0
	discovered = false
	completed = false
	world.generate(1701)
	world.dirty.clear()
	chunk_queue.clear()
	for c in world.chunks.keys(): chunk_queue.append(c)
	if bridge: JavaScriptBridge.eval("window.templeClear()")

func publish_status() -> void:
	var target_name = ""
	if not hit.is_empty(): target_name = TempleVoxels.NAMES[world.get_block(hit.block)] if hit.kind=="voxel" else "Permanent architecture"
	var objective = "Find the service entrance in the east end of the transverse hallway."
	if inventory>0: objective = "Mine through the service door, then build steps up to the city overlook."
	if discovered: objective = "Recover stock in the annex. Build your own route to the upper overlook."
	if completed: objective = "Overlook reached · keep exploring and building."
	var data = {"loading":loading,"progress":1,"selected":selected,"target":target_name,"room":room,"inventory":inventory,"objective":objective,"discovered":discovered,"completed":completed,"message":message if message_timer>0 else "","fps":Engine.get_frames_per_second(),"processMS":Performance.get_monitor(Performance.TIME_PROCESS)*1000,"physicsMS":Performance.get_monitor(Performance.TIME_PHYSICS_PROCESS)*1000,"inputMS":input_ms,"targetMS":target_ms,"publishMS":publish_ms,"quality":quality_mode,"changes":world.changes.size(),"edits":edits,"placed":placed,"broken":broken,"position":[snappedf(player.position.x,0.01),snappedf(player.position.y,0.01),snappedf(player.position.z,0.01)],"yaw":yaw,"pitch":pitch,"grounded":player.is_on_floor(),"dirty":world.dirty.size(),"chunks":world.chunks.size(),"drawCalls":Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME),"triangles":Performance.get_monitor(Performance.RENDER_TOTAL_PRIMITIVES_IN_FRAME)}
	var t_publish = Time.get_ticks_usec()
	publish(data)
	publish_ms = (Time.get_ticks_usec()-t_publish)/1000.0

func publish(data: Dictionary) -> void:
	if bridge: JavaScriptBridge.eval("window.templeUpdate && window.templeUpdate("+JSON.stringify(data)+")")
