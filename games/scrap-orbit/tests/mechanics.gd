extends SceneTree

const Physics = preload("res://scripts/orbital_physics.gd")
const Generator = preload("res://scripts/sector_generator.gd")
const Run = preload("res://scripts/run_state.gd")
var checks := 0
var failures := 0

func check(condition: bool, description: String) -> void:
	checks += 1
	if not condition:
		failures += 1
		printerr("FAIL: ", description)

func _initialize() -> void:
	call_deferred("test_all")

func test_all() -> void:
	var body := Generator.body(Vector2.ZERO, 40, 0)
	check(Physics.acceleration(Vector2(100, 0), [body]).x < 0, "gravity points toward body")
	check(Physics.acceleration(Vector2.ZERO, [body]).is_finite(), "softening is finite at center")
	check(Physics.acceleration(Vector2(1, 0), [body]).length() <= Physics.MAX_ACCELERATION + 0.001, "acceleration is bounded")
	var position := Vector2(225, 400)
	var velocity := Vector2(20, -12)
	for i in 120:
		var next := Physics.step(position, velocity, [])
		position = next[0]
		velocity = next[1]
	check(position.distance_to(Vector2(245, 388)) < 0.01, "zero gravity linear motion")
	check(Physics.collision(Vector2(-100, 0), Vector2(100, 0), [body]) == 0, "swept collision prevents tunneling")
	check(Physics.safe_impact(Vector2(100, 0), 245), "slow impact lands")
	check(not Physics.safe_impact(Vector2(300, 0), 245), "fast impact crashes")
	var sector := Generator.generate(0, 1701)
	position = Vector2(225, 622)
	velocity = Vector2(15, -300)
	var predicted := Physics.predict(position, velocity, sector.bodies, sector.gate, 120, 245)
	for i in 120:
		var next := Physics.step(position, velocity, sector.bodies)
		position = next[0]
		velocity = next[1]
	check(position.distance_to(predicted.end) < 0.001, "preview and runtime agree after 120 fixed steps")
	var again := Physics.predict(Vector2(225, 622), Vector2(15, -300), sector.bodies, sector.gate, 120, 245)
	check(predicted.points == again.points, "identical launch yields identical preview")
	for seed_value in 100:
		for sector_index in 12:
			var layout := Generator.generate(sector_index, seed_value)
			check(layout == Generator.generate(sector_index, seed_value), "deterministic sector")
			for i in layout.bodies.size():
				var b: Dictionary = layout.bodies[i]
				check(b.position.x - b.radius > 10 and b.position.x + b.radius < 440 and b.position.y - b.radius > 82 and b.position.y + b.radius < 744 + 10, "planet inside sector")
				check(b.position.distance_to(layout.gate) > b.radius + 32, "gate outside planets")
				for j in range(i + 1, layout.bodies.size()):
					check(b.position.distance_to(layout.bodies[j].position) > b.radius + layout.bodies[j].radius + 35, "room between planets")
				for s in layout.scraps:
					check(s.position.distance_to(b.position) > b.radius + 20, "salvage outside planets")
			for s in layout.scraps:
				check(s.position.x > 15 and s.position.x < 435 and s.position.y > 82 and s.position.y < 740, "salvage inside bounds")
	var run := Run.new()
	var scrap := {"rare": false, "collected": false}
	check(run.collect(scrap) == 10, "salvage awards score")
	check(run.collect(scrap) == 0 and run.score == 10, "salvage collected once")
	check(run.complete() == 50 and run.score == 60, "completion bonus")
	for id in 7:
		run.apply_upgrade(id)
	check(run.power > 420 and run.magnet > 29 and run.prediction_steps > 720 and run.landing_speed > 245 and run.shields == 4 and run.rare_value > 25 and run.sensor, "all seven upgrades apply")
	check(run.choices(1701).size() == 3, "three unique upgrade choices")
	await test_scene()
	print("MECHANICS: %d checks, %d failures" % [checks, failures])
	quit(1 if failures else 0)

func test_scene() -> void:
	var game = load("res://scenes/Main.tscn").instantiate()
	root.add_child(game)
	await process_frame
	game.set_process(false)
	game.set_physics_process(false)
	game.start_run()
	game.muted = true
	game.run_seed = 1701
	game.load_sector()
	var start: Vector2 = game.ship
	var touch := InputEventScreenTouch.new()
	touch.index = 0
	touch.position = start
	touch.pressed = true
	game._input(touch)
	check(game.state == game.State.AIMING, "touch starts aiming")
	var drag := InputEventScreenDrag.new()
	drag.index = 0
	drag.position = start + Vector2(0, 100)
	game._input(drag)
	check(game.preview.points.size() > 10, "drag shows curved trajectory")
	var cancel := InputEventScreenTouch.new()
	cancel.index = 0
	cancel.canceled = true
	game._input(cancel)
	check(game.state == game.State.DOCKED and game.launches == 0, "touch cancellation does not launch")
	game._input(touch)
	game._input(drag)
	var release := InputEventScreenTouch.new()
	release.index = 0
	game._input(release)
	check(game.state == game.State.FLYING and game.velocity.y < 0, "touch release launches")
	game.ship = start
	game.velocity = Vector2(0, 300)
	game._physics_process(Physics.DT)
	game._physics_process(Physics.DT)
	check(game.state == game.State.CRASHED and game.run.shields == 2, "fast impact spends one shield")
	for i in 45:
		game._physics_process(Physics.DT)
	check(game.state == game.State.DOCKED and game.ship.distance_to(start) < 0.01, "crash returns to checkpoint")
	game.state = game.State.FLYING
	game.velocity = Vector2(0, 100)
	game.ship = start
	for i in 10:
		game._physics_process(Physics.DT)
	check(game.landings > 0 and game.run.shields == 2, "safe landing preserves shields")
	game.state = game.State.FLYING
	game.ship = game.gate + Vector2(0, 5)
	game.velocity = Vector2(0, -50)
	game._physics_process(Physics.DT)
	check(game.state == game.State.WARPING and game.gates == 1, "gate overlap completes sector")
	for i in 80:
		game._physics_process(Physics.DT)
	check(game.mode == "upgrade", "warp leads to upgrade selection")
	game.choose_upgrade(0)
	check(game.run.sector == 1 and game.state == game.State.DOCKED and game.run.power > 420, "upgrade advances sector and persists")
	game.start_aim(game.ship)
	game.toggle_pause()
	check(game.paused and game.state == game.State.DOCKED, "pause cancels aim")
	game.toggle_pause()
	game.run.shields = 1
	game.crash("test")
	for i in 45:
		game._physics_process(Physics.DT)
	check(game.mode == "over", "last shield ends run")
	game.start_run()
	check(game.mode == "playing" and game.run.shields == 3 and game.run.score == 0, "instant retry resets run")
	game.queue_free()
	await process_frame
