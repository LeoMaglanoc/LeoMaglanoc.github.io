extends Node3D

var world: VoxelIsland
var player: CharacterBody3D
var camera: Camera3D
var robots: Node3D
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
var waves = 0
var message = ""
var message_timer = 0.0
var bridge = false
var action_pending: Array = []
var chunk_queue: Array[Vector2i] = []

func _ready() -> void:
	bridge = OS.has_feature("web")
	world = VoxelIsland.new()
	add_child(world)
	load_save()
	world.generate(seed_value)
	world.apply_changes(saved.get("changes",{}) if saved.get("changes",{}) is Dictionary else {})
	for z in 6:
		for x in 6: chunk_queue.append(Vector2i(x,z))
	chunk_queue.sort_custom(func(a,b): return (a-Vector2i(3,3)).length_squared()<(b-Vector2i(3,3)).length_squared())
	setup_scene()
	publish({"loading":true,"progress":0})

func setup_scene() -> void:
	var env = WorldEnvironment.new()
	var e = Environment.new()
	e.background_mode = Environment.BG_COLOR
	e.background_color = Color("b5dfe0")
	e.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	e.ambient_light_color = Color("fff4dc")
	e.ambient_light_energy = 0.62
	e.tonemap_mode = Environment.TONE_MAPPER_LINEAR
	e.fog_enabled = true
	e.fog_light_color = Color("b5dfe0")
	e.fog_density = 0.014
	env.environment = e
	add_child(env)
	var sun = DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-55,-30,0)
	sun.light_color = Color("fff1cf")
	sun.light_energy = 0.55
	sun.shadow_enabled = false
	add_child(sun)
	var ocean = IslandRobot.cube(self,Vector3(200,0.2,200),Vector3(48,4.3,48),Color("72bbcb"))
	ocean.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	# Geometric clouds, original simple shapes.
	for i in 12:
		var cloud = IslandRobot.cube(self,Vector3(10+i%3*3,1.2,4),Vector3(12+i*7,25+i%3*2,14+(i*17)%78),Color("f5f6e7"))
		cloud.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	player = CharacterBody3D.new()
	player.collision_layer = 2
	player.collision_mask = 1
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
	camera.far = 90
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
	var sign = Label3D.new()
	sign.text = "ROBOT LAB\nCHARGE · BUILD · EXPLORE"
	sign.font_size = 44
	sign.pixel_size = 0.009
	sign.position = Vector3(48.5,12.1,37.05)
	sign.modulate = Color("f8edd1")
	add_child(sign)
	robots = Node3D.new()
	add_child(robots)

func finish_loading() -> void:
	loading = false
	for i in 12:
		var bot = IslandRobot.new()
		robots.add_child(bot)
		bot.setup(world,player,i)
	selected = clampi(int(saved.get("selected",1)),1,12)
	yaw = float(saved.get("yaw",0))
	pitch = clampf(float(saved.get("pitch",-0.12)),-1.45,1.45)
	var pos = saved.get("position",[])
	if pos is Array and pos.size() == 3:
		player.position = Vector3(float(pos[0]),float(pos[1]),float(pos[2]))
		if not safe_position(player.position): spawn()
	else: spawn()
	update_camera()
	publish_status()

func spawn() -> void:
	for dz in range(0,24):
		var pos = Vector3(48.5,world.ground(48,53+dz),53.5+dz)
		if pos.y > 5 and safe_position(pos):
			player.position = pos
			player.velocity = Vector3.ZERO
			return
	player.position = Vector3(48.5,25,53.5)
	player.velocity = Vector3.ZERO

func safe_position(pos: Vector3) -> bool:
	if pos.x<1 or pos.x>95 or pos.z<1 or pos.z>95 or pos.y<4 or pos.y>34: return false
	for x in range(floori(pos.x-0.28),floori(pos.x+0.28)+1):
		for z in range(floori(pos.z-0.28),floori(pos.z+0.28)+1):
			for y in range(floori(pos.y+0.02),floori(pos.y+1.73)+1):
				if world.get_block(Vector3i(x,y,z))!=0: return false
	return true

func _process(dt: float) -> void:
	if loading:
		if not chunk_queue.is_empty():
			for batch in mini(4,chunk_queue.size()): world.rebuild(chunk_queue.pop_front())
			publish({"loading":true,"progress":(36-chunk_queue.size())/36.0})
		else: finish_loading()
		return
	if bridge: read_input()
	if not world.dirty.is_empty(): world.rebuild(world.dirty.keys()[0])
	edit_cooldown = maxf(0,edit_cooldown-dt)
	message_timer = maxf(0,message_timer-dt)
	if active:
		for bot in robots.get_children(): bot.tick(dt)
		hit = world.ray(camera.global_position,-camera.global_basis.z)
		selection.visible = not hit.is_empty()
		if not hit.is_empty(): selection.position = Vector3(hit.block)+Vector3.ONE*0.5
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
		for c in world.chunks:
			var center = Vector2(c.x*16+8,c.y*16+8)
			world.chunks[c].visible = center.distance_to(Vector2(player.position.x,player.position.z))<52
		for bot in robots.get_children(): bot.visible = bot.position.distance_to(player.position)<36
		publish_status()

func read_input() -> void:
	var encoded = JavaScriptBridge.eval("window.robotConsume ? window.robotConsume() : '{}'")
	var input = JSON.parse_string(encoded) if encoded is String else {}
	if not input is Dictionary: return
	var was_active = active
	active = bool(input.get("active",false))
	if was_active and not active: save_world()
	move_input = Vector2(float(input.get("x",0)),float(input.get("z",0)))
	yaw -= float(input.get("lookX",0))*0.004
	pitch = clampf(pitch-float(input.get("lookY",0))*0.004,-1.45,1.45)
	selected = clampi(int(input.get("selected",selected)),1,12)
	var quality = float(input.get("quality",0.75))
	if not is_equal_approx(get_viewport().scaling_3d_scale,quality): get_viewport().scaling_3d_scale = quality
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
	player.move_and_slide()
	if player.position.y<4 or player.position.x<0 or player.position.x>=96 or player.position.z<0 or player.position.z>=96:
		spawn()
		notify("Back on dry land.")

func perform(action: String) -> void:
	if action == "wave":
		var nearest: IslandRobot = null
		var distance = 5.0
		for bot in robots.get_children():
			var d = player.position.distance_to(bot.position)
			if d<distance:
				nearest = bot
				distance = d
		if nearest:
			nearest.wave()
			waves += 1
			notify(nearest.nickname+" says hello!")
			sound("wave")
		else: notify("Get closer to a robot to say hello.")
		return
	if edit_cooldown>0: return
	hit = world.ray(camera.global_position,-camera.global_basis.z)
	if hit.is_empty():
		notify("Aim at a nearby block.")
		return
	var p: Vector3i = hit.block if action == "break" else hit.place
	if p.y == 0:
		notify("The island's foundation stays put.")
		return
	if action == "place":
		var body = AABB(player.position+Vector3(-0.29,0.01,-0.29),Vector3(0.58,1.74,0.58))
		if body.intersects(AABB(Vector3(p),Vector3.ONE)):
			notify("Leave a little room for yourself.")
			return
		for bot in robots.get_children():
			if AABB(bot.position+Vector3(-0.35,0,-0.35),Vector3(0.7,1.9,0.7)).intersects(AABB(Vector3(p),Vector3.ONE)):
				notify("Build around your robot friend.")
				return
	if world.edit(p,0 if action == "break" else selected):
		edits += 1
		if action == "break": broken += 1
		else: placed += 1
		edit_cooldown = 0.16
		sound(action)
		notify("Removed "+VoxelIsland.NAMES[world.original[world.index(p)]] if action == "break" else "Placed "+VoxelIsland.NAMES[selected])
		save_world()

func notify(text: String) -> void:
	message = text
	message_timer = 2.5

func sound(kind: String) -> void:
	if bridge: JavaScriptBridge.eval("window.robotSound && window.robotSound("+JSON.stringify(kind)+")")

func load_save() -> void:
	if not bridge: return
	var encoded = JavaScriptBridge.eval("window.robotLoad ? window.robotLoad() : '{}' ")
	var data = JSON.parse_string(encoded) if encoded is String else null
	if data is Dictionary and int(data.get("version",0)) == 1:
		saved = data
		seed_value = clampi(int(saved.get("seed",1701)),0,2147483647)

func save_world() -> void:
	if loading or not bridge: return
	var data = {"version":1,"seed":seed_value,"changes":world.changes,"position":[player.position.x,player.position.y,player.position.z],"selected":selected,"yaw":yaw,"pitch":pitch}
	JavaScriptBridge.eval("window.robotSave("+JSON.stringify(JSON.stringify(data))+")")

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
	waves = 0
	hit = {}
	for bot in robots.get_children():
		robots.remove_child(bot)
		bot.queue_free()
	world.generate(1701)
	world.dirty.clear()
	chunk_queue.clear()
	for z in 6:
		for x in 6: chunk_queue.append(Vector2i(x,z))
	if bridge: JavaScriptBridge.eval("window.robotClear()")

func publish_status() -> void:
	var states = {}
	var moving_count = 0
	for bot in robots.get_children():
		states[bot.state] = int(states.get(bot.state,0))+1
		if bot.moving: moving_count+=1
	var target_name = ""
	if not hit.is_empty(): target_name = VoxelIsland.NAMES[world.get_block(hit.block)]
	var data = {"loading":loading,"progress":1,"selected":selected,"target":target_name,"message":message if message_timer>0 else "","fps":Engine.get_frames_per_second(),"robots":robots.get_child_count(),"moving":moving_count,"states":states,"changes":world.changes.size(),"edits":edits,"placed":placed,"broken":broken,"waves":waves,"position":[snappedf(player.position.x,0.01),snappedf(player.position.y,0.01),snappedf(player.position.z,0.01)],"yaw":yaw,"pitch":pitch,"grounded":player.is_on_floor(),"dirty":world.dirty.size(),"chunks":world.chunks.size(),"drawCalls":Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME),"triangles":Performance.get_monitor(Performance.RENDER_TOTAL_PRIMITIVES_IN_FRAME)}
	publish(data)

func publish(data: Dictionary) -> void:
	if bridge: JavaScriptBridge.eval("window.robotUpdate && window.robotUpdate("+JSON.stringify(data)+")")
