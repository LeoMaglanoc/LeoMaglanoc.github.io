extends Node3D
class_name IslandRobot

var world: VoxelIsland
var player: Node3D
var number = 0
var target = Vector3.ZERO
var timer = 0.0
var clock = 0.0
var waving = 0.0
var moving = false
var state = "idle"
var rng = RandomNumberGenerator.new()
var head: Node3D
var left_arm: Node3D
var right_arm: Node3D
var left_leg: Node3D
var right_leg: Node3D
var label: Label3D
var nickname = ""
var speed = 1.5
var shell: Color

static func cube(parent: Node3D, size: Vector3, pos: Vector3, color: Color) -> MeshInstance3D:
	var node = MeshInstance3D.new()
	var mesh = BoxMesh.new()
	mesh.size = size
	node.mesh = mesh
	var mat = StandardMaterial3D.new()
	mat.albedo_color = color
	mat.roughness = 0.9
	node.material_override = mat
	parent.add_child(node)
	node.position = pos
	return node

func setup(island: VoxelIsland, visitor: Node3D, id: int) -> void:
	world = island
	player = visitor
	number = id
	rng.seed = world.seed_value + id*71
	var kind = id % 3
	shell = [Color("f2f1db"),Color("f2b95c"),Color("9ddad4")][kind]
	var accent = [Color("4796ae"),Color("bc7052"),Color("466778")][kind]
	nickname = ["PIXEL", "NOVA", "DREAMER", "PIP", "ACT", "BEAM", "SLAM", "MUJOCO", "DOT", "SO101", "VLA", "MOSS"][id]
	speed = [1.7,1.2,1.5][kind]
	cube(self,Vector3(0.52,0.53,0.32),Vector3(0,0.86,0),shell)
	cube(self,Vector3(0.21,0.17,0.02),Vector3(0,0.9,-0.17),accent)
	head = Node3D.new()
	add_child(head)
	head.position.y = 1.38
	cube(head,Vector3(0.70,0.49,0.46),Vector3.ZERO,shell)
	cube(head,Vector3(0.58,0.26,0.025),Vector3(0,0,-0.241),Color("294552"))
	for x in [-0.15,0.15]: cube(head,Vector3(0.105,0.08,0.025),Vector3(x,0.02,-0.26),Color("b3ffe0"))
	cube(head,Vector3(0.10,0.03,0.025),Vector3(0,-0.085,-0.26),Color("f6d572"))
	cube(head,Vector3(0.045,0.22,0.045),Vector3(0.2,0.35,0),accent)
	cube(head,Vector3(0.10,0.10,0.10),Vector3(0.2,0.48,0),Color("f6d572"))
	left_arm = limb(Vector3(-0.37,1.02,0),Vector3(0.17,0.43,0.19),shell)
	right_arm = limb(Vector3(0.37,1.02,0),Vector3(0.17,0.43,0.19),shell)
	left_leg = limb(Vector3(-0.16,0.57,0),Vector3(0.18,0.48,0.23),accent)
	right_leg = limb(Vector3(0.16,0.57,0),Vector3(0.18,0.48,0.23),accent)
	label = Label3D.new()
	label.text = nickname + " · %02d" % (id+1)
	label.font_size = 28
	label.pixel_size = 0.009
	label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	label.no_depth_test = false
	label.position.y = 2.1
	label.modulate = Color("ecf5e5")
	add_child(label)
	respawn()
	rotation.y = PI
	timer = rng.randf_range(0.5,3.0)

func limb(pos: Vector3, size: Vector3, color: Color) -> Node3D:
	var pivot = Node3D.new()
	add_child(pivot)
	pivot.position = pos
	cube(pivot,size,Vector3(0,-size.y/2,0),color)
	return pivot

func respawn() -> void:
	var x = 36 + (number % 6)*4
	var z = 43 + (number / 6)*11
	for radius in range(0,12):
		var h = world.ground(x+radius,z)
		if h > 5:
			position = Vector3(x+radius+0.5,h,z+0.5)
			target = position
			return
	position = Vector3(48.5,20,52.5)
	target = position

func wave() -> void:
	waving = 2.2
	timer = 3.0
	target = position

func choose_target() -> void:
	# Adjacent safe grid steps, occasionally biased toward one of the charging pads.
	var s: Vector2i = world.stations[rng.randi_range(0,world.stations.size()-1)]
	var options = [Vector2i(1,0),Vector2i(-1,0),Vector2i(0,1),Vector2i(0,-1)]
	if rng.randf() < 0.4:
		options.push_front(Vector2i(signi(s.x-int(position.x)),0) if abs(s.x-position.x)>abs(s.y-position.z) else Vector2i(0,signi(s.y-int(position.z))))
	else:
		var start = rng.randi_range(0,3)
		options = options.slice(start)+options.slice(0,start)
	for d in options:
		var x = floori(position.x)+d.x
		var z = floori(position.z)+d.y
		var h = world.ground(x,z)
		if h <= 5 or absf(h-position.y)>1.05: continue
		# Avoid squeezing into single-voxel overhangs or another bot.
		var candidate = Vector3(x+0.5,h,z+0.5)
		var crowded = false
		for other in get_parent().get_children():
			if other != self and other is IslandRobot and other.position.distance_to(candidate)<0.6:
				crowded = true
				break
		if crowded: continue
		target = candidate
		timer = rng.randf_range(2,6)
		return
	timer = 0.7
	target = position

func tick(dt: float) -> void:
	clock += dt
	timer -= dt
	waving = maxf(0,waving-dt)
	var distance = position.distance_to(player.position)
	label.visible = distance < 6
	var here_h = world.ground(floori(position.x),floori(position.z))
	if here_h == 0:
		position.y -= dt*6
		if position.y < 3: respawn()
		return
	if position.y < here_h-1.2 or world.get_block(Vector3i(floori(position.x),floori(position.y+0.6),floori(position.z))) != 0:
		# Enclosing a robot leaves it idle; removing its support makes it settle safely.
		state = "trapped"
		target = position
		moving = false
		return
	if position.y > here_h + 0.1 and (position.distance_to(target)<0.1 or position.y-here_h>1.1):
		position.y = move_toward(position.y,float(here_h),dt*6)
		target = position
		if position.y<=5: respawn()
	var target_h = world.ground(floori(target.x),floori(target.z))
	if target_h <= 5 or absf(target_h-position.y)>1.1:
		target = position
		timer = 0
	if timer <= 0: choose_target()
	moving = position.distance_to(target)>0.08 and waving <= 0
	if moving:
		state = "wander"
		var direction = target-position
		rotation.y = lerp_angle(rotation.y,atan2(-direction.x,-direction.z),dt*8)
		position = position.move_toward(target,dt*speed)
	elif waving > 0 or distance < 4:
		state = "wave" if waving > 0 else "look"
		var direction = player.position-position
		rotation.y = lerp_angle(rotation.y,atan2(-direction.x,-direction.z),dt*4)
	else: state = "idle"
	var swing = sin(clock*8)*0.42 if moving else sin(clock*2)*0.03
	left_arm.rotation.x = swing
	right_arm.rotation.x = -swing
	left_leg.rotation.x = -swing
	right_leg.rotation.x = swing
	right_arm.rotation.z = -2.1 + sin(clock*14)*0.3 if waving>0 else 0.0
	head.position.y = 1.38 + absf(sin(clock*8))*0.025 if moving else 1.38+sin(clock*2)*0.015
	head.rotation.y = sin(clock*0.8+number)*0.12
