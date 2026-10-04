extends SceneTree

var checks = 0
func verify(condition: bool, message: String) -> void:
	checks += 1
	if not condition:
		push_error("FAIL: "+message)
		quit(1)
		assert(condition,message)

func _initialize() -> void:
	call_deferred("run")

func run() -> void:
	var world = VoxelIsland.new()
	root.add_child(world)
	world.generate(1701)
	var baseline = world.blocks.duplicate()
	world.generate(1701)
	verify(world.blocks == baseline,"seed determinism")
	verify(world.blocks.size() == 96*96*32,"compact bounded world")
	verify(world.ground(48,53) == 9,"clear spawn floor")
	verify(world.get_block(Vector3i(-1,10,0)) == 0,"out of bounds safe")
	verify(not world.edit(Vector3i(5,0,5),0),"unbreakable foundation")
	var boundary = Vector3i(48,8,53)
	verify(world.edit(boundary,0),"boundary block editable")
	verify(world.dirty.has(Vector2i(2,3)) and world.dirty.has(Vector2i(3,3)),"neighbor chunk dirty on boundary")
	var modifications = world.changes.duplicate()
	world.generate(1701)
	world.apply_changes(modifications)
	verify(world.get_block(boundary) == 0,"save replays edits")
	verify(world.edit(boundary,1),"replace block")
	verify(world.changes.is_empty(),"restoring original removes delta")
	var hit = world.ray(Vector3(48.5,12,53.5),Vector3.DOWN)
	verify(hit.block == Vector3i(48,8,53),"ray hits exact voxel")
	verify(hit.place == Vector3i(48,9,53),"ray supplies adjacent placement voxel")
	verify(world.ray(Vector3(48.5,12,53.5),Vector3.UP).is_empty(),"ray reach bounded")
	world.rebuild(Vector2i(3,3))
	var mesh: ArrayMesh = world.chunks[Vector2i(3,3)].get_child(0).mesh
	var arrays = mesh.surface_get_arrays(0)
	var vertices: PackedVector3Array = arrays[Mesh.ARRAY_VERTEX]
	var normals: PackedVector3Array = arrays[Mesh.ARRAY_NORMAL]
	verify(vertices.size()>0 and vertices.size()%3==0,"valid visible face mesh")
	for i in range(0,vertices.size(),3):
		var cross = (vertices[i+1]-vertices[i]).cross(vertices[i+2]-vertices[i])
		verify(cross.dot(normals[i])<0,"Godot clockwise triangle winding")
	world.queue_free()
	await process_frame
	var scene = load("res://main.tscn").instantiate()
	root.add_child(scene)
	while scene.loading: await process_frame
	verify(scene.robots.get_child_count()==12,"twelve inhabitants")
	verify(scene.safe_position(scene.player.position),"safe spawn")
	scene.active = true
	for i in 90: await physics_frame
	verify(scene.player.is_on_floor() and absf(scene.player.position.y-9)<0.05,"player stands on terrain collision")
	scene.jump_requested = true
	for i in 15: await physics_frame
	verify(scene.player.position.y>9.5,"jump lifts player")
	for i in 90: await physics_frame
	verify(scene.player.is_on_floor(),"jump returns to floor")
	var x_before: float = scene.player.position.x
	scene.move_input = Vector2(1,0)
	for i in 30: await physics_frame
	verify(scene.player.position.x > x_before+1,"movement advances player")
	scene.move_input = Vector2.ZERO
	# At spawn aim down: exercise production editing and self-intersection check.
	scene.spawn()
	scene.pitch = -1.2
	scene.update_camera()
	scene.edit_cooldown = 0
	scene.perform("break")
	verify(scene.broken==1 and scene.world.changes.size()==1,"gameplay break changes terrain")
	scene.player.position = Vector3(48.5,9,55.5)
	scene.pitch = -0.85
	scene.update_camera()
	scene.edit_cooldown = 0
	scene.perform("place")
	verify(scene.placed==1,"gameplay placement")
	var bot: IslandRobot = scene.robots.get_child(0)
	bot.wave()
	bot.tick(0.1)
	verify(bot.state == "wave" and bot.right_arm.rotation.z < -1,"robot wave animates")
	var hole = Vector3i(38,8,43)
	bot.position = Vector3(37.5,9,43.5)
	bot.target = Vector3(38.5,9,43.5)
	bot.timer = 3
	for y in range(1,9): scene.world.raw_set(Vector3i(hole.x,y,hole.z),0)
	bot.tick(0.1)
	verify(bot.target != Vector3(38.5,9,43.5),"robot rejects newly removed support")
	bot.position = Vector3(-5,2,-5)
	bot.tick(0.1)
	verify(bot.position.y>5 and bot.position.x>0,"fallen robot recovers")
	var states = {}
	for i in 120:
		for other in scene.robots.get_children():
			other.tick(0.1)
			states[other.state] = true
	verify(states.has("wander") and states.has("idle"),"robots wander and idle")
	verify(not scene.safe_position(Vector3(48.5,8,53.5)),"save position inside solid rejected")
	print("PASS: ",checks," checks (terrain, winding, chunk boundaries, raycast, collisions, jumping, editing, robots)")
	quit(0)
