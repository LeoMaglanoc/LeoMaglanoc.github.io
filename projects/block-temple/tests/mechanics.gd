extends SceneTree
var checks = 0
func verify(ok: bool, label: String) -> void:
	checks += 1
	if not ok:
		push_error("FAIL: "+label)
		quit(1)
		assert(ok,label)
func _initialize() -> void: call_deferred("run")
func ticks(n: int) -> void:
	for i in n: await physics_frame
func run() -> void:
	var world = TempleVoxels.new()
	root.add_child(world)
	world.generate()
	verify(world.blocks.size()==160*160*40,"bounded compact volume")
	verify(world.get_block(Vector3i(103,5,112))==1,"mineable entrance")
	verify(world.get_block(Vector3i(66,4,80))==0,"authored hall is not voxelized")
	verify(not world.edit(Vector3i(1,4,1),1),"placement outside playable mask denied")
	verify(world.edit(Vector3i(112,5,112),2),"editable construction region")
	verify(world.dirty.has(Vector2i(6,7)) and world.dirty.has(Vector2i(7,7)),"boundary chunk neighbours rebuilt")
	var saved = world.changes.duplicate()
	world.generate(); world.apply_changes(saved)
	verify(world.get_block(Vector3i(112,5,112))==2,"delta save replays")
	world.apply_changes({"0,4,0":12,"103,5,112":99})
	verify(world.get_block(Vector3i(0,4,0))==0 and world.get_block(Vector3i(103,5,112))==1,"invalid save cells rejected")
	var h = world.ray(Vector3(101,5.5,112.5),Vector3.RIGHT)
	verify(h.block==Vector3i(103,5,112) and h.place==Vector3i(102,5,112),"DDA entrance and adjacent placement")
	verify(world.ray(Vector3(101,5.5,112.5),Vector3.LEFT).is_empty(),"ray reach limit")
	world.rebuild(Vector2i(6,7))
	var mesh: ArrayMesh = world.chunks[Vector2i(6,7)].get_child(0).mesh
	var arrays = mesh.surface_get_arrays(0)
	var vv: PackedVector3Array = arrays[Mesh.ARRAY_VERTEX]
	var nn: PackedVector3Array = arrays[Mesh.ARRAY_NORMAL]
	for i in range(0,vv.size(),3): verify((vv[i+1]-vv[i]).cross(vv[i+2]-vv[i]).dot(nn[i])<0,"voxel clockwise winding")
	world.queue_free(); await process_frame
	var game = load("res://main.tscn").instantiate()
	root.add_child(game)
	while game.loading: await process_frame
	game.active = true
	await ticks(10)
	verify(game.safe_position(game.player.position),"collision-free spawn")
	verify(game.player.is_on_floor() and abs(game.player.position.y-4)<.06,"authored floor collision")
	var position_before: Vector3 = game.player.position
	game.move_input = Vector2(0,-1); await ticks(30); game.move_input=Vector2.ZERO
	verify(game.player.position.z<position_before.z-1,"first person movement")
	game.jump_requested=true; await ticks(15)
	verify(game.player.position.y>4.5,"jump lifts player")
	await ticks(70); verify(game.player.is_on_floor(),"jump returns to fixed floor")
	# Pure closest-hit cases and real authored wall occlusion.
	verify(game.closest_hit({"distance":1},{"distance":2}).distance==1,"voxel closer")
	verify(game.closest_hit({"distance":2},{"distance":1}).distance==1,"architecture closer")
	verify(game.closest_hit({}, {"distance":1}).distance==1,"mesh only")
	verify(game.closest_hit({"distance":1},{}).distance==1,"voxel only")
	verify(game.closest_hit({},{}).is_empty(),"miss")
	var wall_hit = game.target_query(Vector3(66,5,105),Vector3(0,0,1))
	# Centre door is open; side of hall south wall must be permanent.
	wall_hit = game.target_query(Vector3(58,5,105),Vector3(0,0,1))
	verify(wall_hit.get("kind","")=="architecture","physics ray hits authored wall")
	game.player.position=Vector3(101,4.05,112.5); game.yaw=-PI/2; game.pitch=0; game.update_camera(); await ticks(5)
	verify(game.target_query(game.camera.global_position,Vector3.RIGHT).kind=="voxel","production hybrid entrance target")
	game.perform("break")
	verify(game.broken==1 and game.inventory==1 and game.world.get_block(Vector3i(103,5,112))==0,"mining recovers inventory")
	verify(not game.can_place(Vector3i(101,4,112)),"player intersection denied")
	verify(not game.can_place(Vector3i(128,5,112)),"static wall intersection denied")
	verify(game.can_place(Vector3i(106,4,112)),"placement on authored floor allowed")
	var before = game.world.changes.size()
	game.player.position=Vector3(58,4.05,105); game.yaw=PI; game.pitch=0; game.update_camera(); game.edit_cooldown=0; await ticks(3)
	game.perform("break")
	verify(game.world.changes.size()==before,"permanent architecture cannot be broken")
	# Stair ascent using the real capsule controller; no teleport during traversal.
	game.player.position=Vector3(66,4.05,33.5); game.yaw=0; game.pitch=0; game.update_camera(); await ticks(5)
	game.move_input=Vector2(0,-1); await ticks(85); game.move_input=Vector2.ZERO; await ticks(10)
	verify(game.player.position.y>6.6 and game.player.position.z<27,"authored stairs are walkable")
	# Every named room has a collision-free supported central position.
	for p in [Vector3(27,4.05,50),Vector3(29,4.05,78),Vector3(66,4.05,139),Vector3(110,4.05,86),Vector3(107,4.05,48),Vector3(45,4.05,95),Vector3(87,4.05,95)]:
		game.player.position=p; game.player.velocity=Vector3.ZERO; await ticks(5)
		verify(game.safe_position(game.player.position),"room clearance "+str(p))
		verify(game.player.is_on_floor(),"room supported "+str(p))
	# Initially sealed: the wall is full height and meets the lintel and jambs.
	for z in range(110,114):
		for y in range(4,8):
			verify(game.world.original[game.world.index(Vector3i(103,y,z))]!=0,"entrance sealed")
	verify(game.layout.markers.has("MARKER_Secret"),"overlook marker imported")
	# A player-built candidate staircase fixture; traverse using only movement/jump.
	# Each occupied cell passes the production placement policy before insertion.
	for x in range(114,120):
		for y in range(4,5+x-114):
			var cell = Vector3i(x,y,113)
			verify(game.can_place(cell),"stair cell clears authored geometry")
			verify(game.world.edit(cell,1),"construction changes voxel world")
	while not game.world.dirty.is_empty(): await process_frame
	game.player.position=Vector3(113.5,4.05,113.5); game.player.velocity=Vector3.ZERO
	game.yaw=0; game.update_camera(); await ticks(5)
	game.move_input=Vector2(1,0)
	for i in 6:
		game.jump_requested=true; await ticks(48)
	game.move_input=Vector2.ZERO; await ticks(5)
	verify(game.player.position.y>=9.9,"constructed staircase climbs six metres")
	game.move_input=Vector2(1,0); await ticks(35); game.move_input=Vector2.ZERO; await ticks(5)
	game.update_progression()
	verify(game.completed and game.discovered,"walked construction route reaches overlook reward")
	game.reset_world()
	while game.loading: await process_frame
	await ticks(5)
	verify(game.world.changes.is_empty() and game.inventory==0 and not game.completed,"reset restores original")
	verify(game.world.get_block(Vector3i(103,5,112))==1,"reset reseals entrance")
	print("PASS: ",checks," checks (voxels, hybrid rays, placement, stairs, rooms, progression, reset)")
	game.queue_free(); await process_frame
	quit(0)
