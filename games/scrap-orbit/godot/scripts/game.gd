extends Node2D

const Physics = preload("res://scripts/orbital_physics.gd")
const Generator = preload("res://scripts/sector_generator.gd")
const Run = preload("res://scripts/run_state.gd")
const TEAL := Color("8bf0dc")
const GOLD := Color("f7c787")
const INK := Color("080f1c")
const TEXT := Color("e5edf1")
const MUTED := Color("8298ac")
enum State { DOCKED, AIMING, FLYING, LANDING, CRASHED, WARPING }
var state := State.DOCKED
var run = Run.new()
var run_seed := 1701
var bodies: Array = []
var scraps: Array = []
var gate := Vector2.ZERO
var sector_name := ""
var ship := Vector2.ZERO
var velocity := Vector2.ZERO
var checkpoint := Vector2.ZERO
var dock_body := 0
var checkpoint_body := 0
var aim_origin := Vector2.ZERO
var aim_pointer := Vector2.ZERO
var active_touch := -1
var preview: Dictionary = {"points": PackedVector2Array(), "result": "drift"}
var trail := PackedVector2Array()
var particles: Array = []
var stars: Array = []
var near_bodies: Array[int] = []
var elapsed := 0.0
var flight_time := 0.0
var phase_time := 0.0
var shake := 0.0
var toast := ""
var toast_time := 0.0
var mode := "menu"
var paused := false
var muted := false
var best := 0
var ui: CanvasLayer
var hud: Label
var hint: Label
var toast_label: Label
var overlay: Control
var sound_button: Button
var pause_button: Button
var choices: Array[int] = []
var audio: AudioStreamPlayer
var sounds: Dictionary = {}
var bridge_callback
var telemetry_time := 0.0
var physics_frame := 0
var launches := 0
var landings := 0
var crashes := 0
var gates := 0
var font := ThemeDB.fallback_font

func _ready() -> void:
	var rng := RandomNumberGenerator.new()
	rng.seed = 38
	for i in 100:
		stars.append([Vector2(rng.randf_range(10, 440), rng.randf_range(82, 743)), rng.randf_range(0.5, 1.6), rng.randf_range(0.2, 0.8)])
	audio = AudioStreamPlayer.new()
	add_child(audio)
	for name in ["launch", "scrap", "landing", "crash", "warp", "near"]:
		sounds[name] = make_sound(name)
	load_best()
	build_ui()
	load_sector()
	show_menu()
	if OS.has_feature("web"):
		bridge_callback = JavaScriptBridge.create_callback(_browser_event)
		var window = JavaScriptBridge.get_interface("window")
		window.scrapOrbitEvent = bridge_callback
		JavaScriptBridge.eval("window.scrapOrbitReady = true;", true)

func make_sound(kind: String) -> AudioStreamWAV:
	var duration := 0.18 if kind != "warp" else 0.65
	var data := PackedByteArray()
	var count := int(duration * 22050)
	data.resize(count * 2)
	var phase := 0.0
	for i in count:
		var t := float(i) / count
		var hz := 180.0
		match kind:
			"launch": hz = lerpf(180, 600, t)
			"scrap": hz = 720 if t < 0.45 else 1080
			"landing": hz = lerpf(280, 120, t)
			"crash": hz = lerpf(100, 35, t)
			"warp": hz = lerpf(220, 1320, t)
			"near": hz = lerpf(500, 160, t)
		phase += TAU * hz / 22050.0
		var wave := sin(phase) * (1 - t) * minf(t * 30, 1) * 0.24
		if kind == "crash":
			wave += sin(i * 17.3) * (1 - t) * 0.16
		data.encode_s16(i * 2, int(wave * 32767))
	var stream := AudioStreamWAV.new()
	stream.format = AudioStreamWAV.FORMAT_16_BITS
	stream.mix_rate = 22050
	stream.data = data
	return stream

func play_sound(kind: String) -> void:
	if not muted:
		audio.stream = sounds[kind]
		audio.play()

func style(fill: Color, border: Color) -> StyleBoxFlat:
	var box := StyleBoxFlat.new()
	box.bg_color = fill
	box.border_color = border
	box.set_border_width_all(1)
	box.set_corner_radius_all(12)
	box.content_margin_left = 18
	box.content_margin_right = 18
	return box

func label_at(parent: Node, text: String, rect: Rect2, size: int, color: Color = TEXT) -> Label:
	var label := Label.new()
	label.text = text
	label.position = rect.position
	label.size = rect.size
	label.add_theme_font_size_override("font_size", size)
	label.add_theme_color_override("font_color", color)
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	parent.add_child(label)
	return label

func button_at(parent: Node, text: String, rect: Rect2, action: Callable, primary: bool = false) -> Button:
	var button := Button.new()
	button.text = text
	button.position = rect.position
	button.size = rect.size
	button.add_theme_font_size_override("font_size", 16)
	button.add_theme_color_override("font_color", INK if primary else TEXT)
	button.add_theme_color_override("font_hover_color", INK if primary else TEXT)
	button.add_theme_stylebox_override("normal", style(TEAL if primary else Color("152437"), TEAL if primary else Color("324759")))
	button.add_theme_stylebox_override("hover", style(Color("c2ffee") if primary else Color("213a4b"), TEAL))
	button.add_theme_stylebox_override("pressed", style(Color("6bc9b9"), TEAL))
	button.pressed.connect(action)
	parent.add_child(button)
	return button

func build_ui() -> void:
	ui = CanvasLayer.new()
	add_child(ui)
	label_at(ui, "SCRAP / ORBIT", Rect2(24, 15, 250, 25), 20, TEAL)
	hud = label_at(ui, "", Rect2(24, 46, 405, 25), 13, MUTED)
	hint = label_at(ui, "", Rect2(24, 731, 402, 21), 14, TEXT)
	hint.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	toast_label = label_at(ui, "", Rect2(22, 104, 406, 27), 16, GOLD)
	toast_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	sound_button = button_at(ui, "SOUND ON", Rect2(24, 756, 113, 44), toggle_sound)
	sound_button.add_theme_font_size_override("font_size", 11)
	pause_button = button_at(ui, "PAUSE", Rect2(326, 756, 100, 44), toggle_pause)
	pause_button.add_theme_font_size_override("font_size", 11)
	overlay = Control.new()
	overlay.size = Vector2(450, 800)
	overlay.mouse_filter = Control.MOUSE_FILTER_IGNORE
	ui.add_child(overlay)

func clear_overlay() -> void:
	for node in overlay.get_children():
		node.queue_free()

func panel(rect: Rect2) -> void:
	var dim := ColorRect.new()
	dim.color = Color(0.025, 0.045, 0.08, 0.82)
	dim.size = Vector2(450, 800)
	dim.mouse_filter = Control.MOUSE_FILTER_STOP
	overlay.add_child(dim)
	var bg := Panel.new()
	bg.position = rect.position
	bg.size = rect.size
	bg.add_theme_stylebox_override("panel", style(Color("0f1c2b"), Color("355265")))
	overlay.add_child(bg)

func show_menu() -> void:
	mode = "menu"
	panel(Rect2(26, 226, 398, 363))
	label_at(overlay, "A LITTLE SHIP. A LOT OF GRAVITY.", Rect2(48, 250, 360, 25), 12, TEAL)
	label_at(overlay, "Scrap Orbit", Rect2(48, 287, 350, 50), 40)
	label_at(overlay, "Pull back. Let gravity do the rest.", Rect2(48, 350, 354, 30), 17, MUTED)
	label_at(overlay, "Skim worlds, gather salvage, find the relay.", Rect2(48, 388, 360, 28), 14, MUTED)
	button_at(overlay, "BEGIN SALVAGE RUN  >", Rect2(48, 446, 354, 58), start_run, true)
	label_at(overlay, "ONE FINGER / ENDLESS SPACE", Rect2(48, 527, 340, 22), 12, TEAL)

func start_run() -> void:
	clear_overlay()
	run = Run.new()
	run_seed = int(Time.get_unix_time_from_system()) % 1000000
	if OS.has_feature("web"):
		var requested = JavaScriptBridge.eval("new URLSearchParams(location.search).get('seed')", true)
		if requested != null and str(requested).is_valid_int():
			run_seed = int(str(requested))
	mode = "playing"
	paused = false
	launches = 0
	landings = 0
	crashes = 0
	gates = 0
	load_sector()
	notify("DRAG THE SHIP BACKWARD, THEN RELEASE", 3.0)

func load_sector() -> void:
	var sector: Dictionary = Generator.generate(run.sector, run_seed)
	bodies = sector.bodies
	scraps = sector.scraps
	gate = sector.gate
	sector_name = sector.name
	ship = bodies[0].position + Vector2(0, -bodies[0].radius - 10)
	checkpoint = ship
	dock_body = 0
	checkpoint_body = 0
	velocity = Vector2.ZERO
	state = State.DOCKED
	trail.clear()
	particles.clear()
	near_bodies.clear()
	run.sector_salvage = 0
	run.sector_near_misses = 0
	preview = {"points": PackedVector2Array(), "result": "drift"}
	flight_time = 0
	active_touch = -1

func launch_velocity() -> Vector2:
	var pull := aim_origin - aim_pointer
	return pull.limit_length(160) * (run.power / 160.0)

func start_aim(point: Vector2, touch: int = -1) -> void:
	if mode != "playing" or paused or state != State.DOCKED:
		return
	if point.distance_to(ship) > 48:
		return
	active_touch = touch
	state = State.AIMING
	aim_origin = point
	aim_pointer = point
	update_preview()

func update_aim(point: Vector2) -> void:
	if state == State.AIMING:
		aim_pointer = point
		update_preview()

func update_preview() -> void:
	preview = Physics.predict(ship, launch_velocity(), bodies, gate, run.prediction_steps, run.landing_speed)

func release_aim() -> void:
	if state != State.AIMING:
		return
	active_touch = -1
	if aim_origin.distance_to(aim_pointer) < 10:
		cancel_aim()
		return
	velocity = launch_velocity()
	state = State.FLYING
	launches += 1
	flight_time = 0
	near_bodies.clear()
	near_bodies.append(dock_body)
	trail.clear()
	burst(ship, TEAL, 16, 85)
	play_sound("launch")
	shake = 1.8

func cancel_aim() -> void:
	if state == State.AIMING:
		state = State.DOCKED
	active_touch = -1
	preview = {"points": PackedVector2Array(), "result": "drift"}

func _input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and not event.echo:
		if event.keycode == KEY_ESCAPE or event.keycode == KEY_P:
			toggle_pause()
		if event.keycode == KEY_M:
			toggle_sound()
		if event.keycode == KEY_R and mode == "over":
			start_run()
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT:
		if event.pressed:
			start_aim(get_global_mouse_position())
		else:
			release_aim()
	elif event is InputEventMouseMotion and state == State.AIMING and active_touch == -1:
		update_aim(get_global_mouse_position())
	elif event is InputEventScreenTouch:
		if event.canceled and event.index == active_touch:
			cancel_aim()
		elif event.pressed:
			start_aim(event.position, event.index)
		elif event.index == active_touch:
			release_aim()
	elif event is InputEventScreenDrag and event.index == active_touch:
		update_aim(event.position)

func _notification(what: int) -> void:
	if what == NOTIFICATION_APPLICATION_FOCUS_OUT:
		cancel_aim()
		if mode == "playing" and not paused:
			toggle_pause()

func _browser_event(args: Array) -> void:
	if args.is_empty():
		return
	var action := str(args[0])
	if action == "cancel":
		cancel_aim()
	elif action == "pause" and mode == "playing" and not paused:
		toggle_pause()

func toggle_sound() -> void:
	muted = not muted
	if muted:
		audio.stop()
	sound_button.text = "SOUND OFF" if muted else "SOUND ON"

func toggle_pause() -> void:
	if mode != "playing":
		return
	cancel_aim()
	paused = not paused
	clear_overlay()
	if paused:
		panel(Rect2(28, 275, 394, 272))
		label_at(overlay, "HOLDING ORBIT", Rect2(50, 300, 350, 36), 27, TEAL)
		label_at(overlay, "Take a breath. Space can wait.", Rect2(50, 349, 350, 30), 16, MUTED)
		button_at(overlay, "RESUME FLIGHT", Rect2(50, 397, 350, 52), toggle_pause, true)
		button_at(overlay, "NEW RUN", Rect2(50, 467, 350, 48), start_run)

func _physics_process(dt: float) -> void:
	if mode != "playing" or paused:
		return
	physics_frame += 1
	phase_time += dt
	if state == State.LANDING and phase_time > 0.13:
		state = State.DOCKED
	elif state == State.CRASHED and phase_time > 0.32:
		if run.shields <= 0:
			game_over()
		else:
			ship = checkpoint
			dock_body = checkpoint_body
			velocity = Vector2.ZERO
			trail.clear()
			state = State.DOCKED
	elif state == State.WARPING and phase_time > 0.6:
		show_upgrades()
	elif state == State.FLYING:
		flight_time += dt
		var previous := ship
		var next := Physics.step(ship, velocity, bodies)
		ship = next[0]
		velocity = next[1]
		trail.append(ship)
		if trail.size() > 85:
			trail.remove_at(0)
		collect_salvage(previous)
		if Physics.segment_distance(previous, ship, gate) < 27:
			state = State.WARPING
			phase_time = 0
			gates += 1
			run.complete()
			save_best()
			burst(gate, TEAL, 60, 210)
			play_sound("warp")
			return
		var hit := Physics.collision(previous, ship, bodies)
		if hit >= 0:
			if Physics.safe_impact(velocity, run.landing_speed):
				land(hit)
			else:
				crash("HARD IMPACT / SHIELD USED")
			return
		for i in bodies.size():
			var distance: float = ship.distance_to(bodies[i].position) - bodies[i].radius
			if distance < 32 and distance > 7 and velocity.length() > 165 and not i in near_bodies:
				near_bodies.append(i)
				run.score += 25
				run.sector_near_misses += 1
				notify("CLOSE ORBIT  +25")
				burst(ship, GOLD, 10, 70)
				play_sound("near")
		if Physics.outside(ship) or flight_time > 20:
			crash("LOST IN SPACE / SHIELD USED")

func collect_salvage(previous: Vector2) -> void:
	for scrap in scraps:
		if scrap.collected:
			continue
		var distance := Physics.segment_distance(previous, ship, scrap.position)
		if distance < run.magnet:
			var value: int = run.collect(scrap)
			burst(scrap.position, GOLD, 12, 55)
			play_sound("scrap")
			notify("SALVAGE  +%d" % value, 0.9)
		elif scrap.position.distance_to(ship) < run.magnet + 30:
			scrap.position = scrap.position.move_toward(ship, 105 * Physics.DT)

func land(index: int) -> void:
	var normal: Vector2 = (ship - bodies[index].position).normalized()
	ship = bodies[index].position + normal * (bodies[index].radius + 10)
	checkpoint = ship
	dock_body = index
	checkpoint_body = index
	landings += 1
	if velocity.length() < 110 and flight_time > 0.6:
		run.score += 15
		notify("SOFT LANDING  +15")
	else:
		notify("DOCKED / READY TO LAUNCH", 1.2)
	velocity = Vector2.ZERO
	state = State.LANDING
	phase_time = 0
	shake = 1.8
	burst(ship, bodies[index].color, 12, 60)
	play_sound("landing")

func crash(message: String) -> void:
	state = State.CRASHED
	phase_time = 0
	run.shields -= 1
	crashes += 1
	shake = 5
	burst(ship, Color("f09383"), 30, 170)
	play_sound("crash")
	notify(message, 2)

func show_upgrades() -> void:
	mode = "upgrade"
	choices = run.choices(run_seed)
	clear_overlay()
	panel(Rect2(26, 186, 398, 480))
	label_at(overlay, "RELAY REACHED", Rect2(48, 208, 350, 30), 26, TEAL)
	label_at(overlay, "Sector %02d complete" % (run.sector + 1), Rect2(48, 248, 350, 28), 17)
	label_at(overlay, "Salvage %d  /  close orbits %d  /  bonus %d" % [run.sector_salvage, run.sector_near_misses, 50 + run.sector * 15], Rect2(48, 282, 354, 25), 13, MUTED)
	label_at(overlay, "MAKE YOUR SHIP A LITTLE BETTER", Rect2(48, 322, 354, 25), 12, GOLD)
	for i in 3:
		var id := choices[i]
		var info: Dictionary = Run.UPGRADES[id]
		button_at(overlay, "%s  /  %s\n%s" % [info.icon, info.name, info.description], Rect2(48, 365 + i * 89, 354, 74), choose_upgrade.bind(id))

func choose_upgrade(id: int) -> void:
	run.apply_upgrade(id)
	run.sector += 1
	clear_overlay()
	mode = "playing"
	load_sector()
	notify("SECTOR %02d / %s" % [run.sector + 1, sector_name], 2.5)

func game_over() -> void:
	mode = "over"
	save_best()
	clear_overlay()
	panel(Rect2(26, 225, 398, 354))
	label_at(overlay, "END OF TRANSMISSION", Rect2(48, 248, 356, 28), 14, GOLD)
	label_at(overlay, "%d" % run.score, Rect2(48, 288, 350, 67), 52)
	label_at(overlay, "SALVAGE SCORE  /  BEST %d" % best, Rect2(48, 365, 350, 30), 14, MUTED)
	label_at(overlay, "%d relays reached. Another orbit awaits." % run.sector, Rect2(48, 402, 360, 30), 15, MUTED)
	button_at(overlay, "ONE MORE RUN  >", Rect2(48, 465, 354, 62), start_run, true)

func load_best() -> void:
	if FileAccess.file_exists("user://best.txt"):
		var file := FileAccess.open("user://best.txt", FileAccess.READ)
		if file:
			best = maxi(0, int(file.get_as_text()))
	if OS.has_feature("web"):
		var stored = JavaScriptBridge.eval("(()=>{try{return localStorage.getItem('scrap-orbit-best')||'0'}catch(e){return '0'}})()", true)
		best = maxi(best, int(str(stored)))

func save_best() -> void:
	if run.score <= best:
		return
	best = run.score
	var file := FileAccess.open("user://best.txt", FileAccess.WRITE)
	if file:
		file.store_string(str(best))
	if OS.has_feature("web"):
		JavaScriptBridge.eval("try{localStorage.setItem('scrap-orbit-best', '%d')}catch(e){}" % best, true)

func notify(message: String, duration: float = 1.5) -> void:
	toast = message
	toast_time = duration

func burst(point: Vector2, color: Color, count: int, speed: float) -> void:
	for i in count:
		var angle := TAU * float(i) / count + elapsed
		particles.append({"position": point, "velocity": Vector2.from_angle(angle) * randf_range(speed * 0.3, speed), "life": randf_range(0.3, 0.7), "color": color})

func _process(dt: float) -> void:
	elapsed += dt
	if not paused:
		toast_time = maxf(0, toast_time - dt)
		shake = move_toward(shake, 0, dt * 16)
		for i in range(particles.size() - 1, -1, -1):
			particles[i].life -= dt
			particles[i].position += particles[i].velocity * dt
			if particles[i].life <= 0:
				particles.remove_at(i)
	position = Vector2(sin(elapsed * 113), cos(elapsed * 87)) * shake
	hud.text = "SECTOR %02d   SCORE %d   SHIELDS %s   BEST %d" % [run.sector + 1, run.score, str(maxi(0, run.shields)), best]
	toast_label.text = toast if toast_time > 0 and mode == "playing" else ""
	if mode == "playing":
		if paused:
			hint.text = "FLIGHT PAUSED"
		elif state == State.AIMING:
			var result: String = preview.result
			var captions := {"landing": "SOFT LANDING", "crash": "HARD IMPACT / SHORTEN YOUR PULL", "gate": "RELAY IN REACH", "lost": "OUT OF RANGE", "drift": "LET GRAVITY BEND YOUR PATH"}
			hint.text = captions[result]
		elif state == State.DOCKED:
			hint.text = "Touch the ship · pull backward · release"
		elif state == State.FLYING:
			hint.text = "IN FLIGHT / FOLLOW THE CURVE"
		elif state == State.CRASHED:
			hint.text = "RECOVERING AT YOUR LAST LANDING"
		else:
			hint.text = ""
	else:
		hint.text = ""
	pause_button.visible = mode == "playing" and not paused
	telemetry_time += dt
	if OS.has_feature("web") and telemetry_time > 0.1:
		telemetry_time = 0
		publish_telemetry()
	queue_redraw()

func publish_telemetry() -> void:
	var data := {"mode": mode, "state": State.keys()[state], "paused": paused, "sector": run.sector + 1, "score": run.score, "shields": run.shields, "best": best, "ship": [ship.x, ship.y], "velocity": [velocity.x, velocity.y], "gate": [gate.x, gate.y], "launches": launches, "landings": landings, "crashes": crashes, "gates": gates, "preview": preview.result, "prediction_count": preview.points.size(), "physics_frame": physics_frame, "flight_time": flight_time, "seed": run_seed, "hint": hint.text, "choices": choices}
	JavaScriptBridge.eval("window.scrapOrbitReport(%s)" % JSON.stringify(data), true)

func _draw() -> void:
	draw_rect(Rect2(-10, -10, 470, 820), INK)
	# Fine star chart, deliberately quiet behind the playfield.
	for x in range(25, 450, 50):
		draw_line(Vector2(x, 82), Vector2(x, 742), Color(0.15, 0.27, 0.34, 0.12), 1)
	for y in range(92, 745, 50):
		draw_line(Vector2(14, y), Vector2(436, y), Color(0.15, 0.27, 0.34, 0.12), 1)
	for star in stars:
		draw_circle(star[0], star[1], Color(0.65, 0.79, 0.86, star[2] * (0.75 + 0.25 * sin(elapsed * 0.7 + star[0].x))))
	draw_line(Vector2(24, 78), Vector2(426, 78), Color("273d4d"), 1)
	draw_line(Vector2(24, 727), Vector2(426, 727), Color("273d4d"), 1)
	draw_string(font, Vector2(27, 99), sector_name, HORIZONTAL_ALIGNMENT_LEFT, -1, 10, MUTED)
	for i in bodies.size():
		draw_planet(bodies[i], i)
	draw_gate()
	for scrap in scraps:
		if not scrap.collected:
			draw_scrap(scrap)
	for i in range(1, trail.size()):
		var alpha := float(i) / trail.size() * 0.65
		draw_line(trail[i - 1], trail[i], Color(TEAL, alpha), 2, true)
	if state == State.AIMING:
		var points: PackedVector2Array = preview.points
		var color := Color("f19689") if preview.result == "crash" else TEAL
		for i in points.size():
			draw_circle(points[i], 2.0 if i % 3 != 0 else 2.6, Color(color, 1.0 - float(i) / maxf(1, points.size()) * 0.8))
		if preview.result in ["landing", "gate", "crash"]:
			draw_arc(preview.end, 13, 0, TAU, 32, color, 1.5, true)
		draw_line(ship, ship + (aim_pointer - aim_origin).limit_length(160), Color(GOLD, 0.7), 1.5, true)
		draw_circle(ship + (aim_pointer - aim_origin).limit_length(160), 5, GOLD, false, 1.5, true)
	if state != State.CRASHED:
		draw_ship()
	for particle in particles:
		draw_circle(particle.position, 2.1, Color(particle.color, minf(particle.life * 2, 1)))

func draw_planet(body: Dictionary, index: int) -> void:
	var center: Vector2 = body.position
	var radius: float = body.radius
	var color: Color = body.color
	for j in range(5, 0, -1):
		draw_circle(center, radius + j * 4, Color(color, 0.012 * (6 - j)))
	draw_circle(center, radius, color.darkened(0.72))
	draw_circle(center + Vector2(-radius * 0.16, -radius * 0.14), radius * 0.77, color.darkened(0.65))
	draw_circle(center + Vector2(radius * 0.29, radius * 0.18), radius * 0.21, Color(color.darkened(0.8), 0.7))
	draw_circle(center + Vector2(-radius * 0.32, radius * 0.26), radius * 0.12, color.darkened(0.76))
	draw_arc(center, radius, 0, TAU, 72, Color(color, 0.6), 1.5, true)
	draw_arc(center, radius + 2, PI * 1.02, PI * 1.8, 36, color, 2, true)
	draw_arc(center, radius + 24, -0.4, 2.7, 64, Color(color, 0.13), 1, true)
	if run.sensor:
		draw_arc(center, radius + 31, 0, TAU, 64, Color(GOLD, 0.3), 1, true)
	if index == 0:
		draw_string(font, center + Vector2(-28, 5), "HOME", HORIZONTAL_ALIGNMENT_LEFT, -1, 10, Color(color, 0.8))

func draw_gate() -> void:
	var pulse := 1.0 + 0.07 * sin(elapsed * 2)
	for i in range(4, 0, -1):
		draw_circle(gate, (25 + i * 4) * pulse, Color(TEAL, 0.018))
	draw_arc(gate, 26 * pulse, elapsed * 0.3, elapsed * 0.3 + TAU * 0.84, 64, TEAL, 2.5, true)
	draw_arc(gate, 19, -elapsed * 0.5, -elapsed * 0.5 + TAU * 0.7, 48, Color(TEAL, 0.45), 1.2, true)
	draw_circle(gate, 5, Color(TEAL, 0.8))
	draw_line(gate - Vector2(0, 9), gate + Vector2(0, 9), TEAL, 1.5)
	draw_line(gate - Vector2(9, 0), gate + Vector2(9, 0), TEAL, 1.5)
	draw_string(font, gate + Vector2(-18, 47), "RELAY", HORIZONTAL_ALIGNMENT_LEFT, -1, 10, TEAL)

func draw_scrap(scrap: Dictionary) -> void:
	var p: Vector2 = scrap.position
	var size := 6.0 if scrap.rare else 4.5
	var color := GOLD if scrap.rare else Color("cad8ba")
	draw_circle(p, 13, Color(color, 0.045 + sin(elapsed * 3 + p.y) * 0.015))
	var vertices := PackedVector2Array([p + Vector2(0, -size), p + Vector2(size, 0), p + Vector2(0, size), p + Vector2(-size, 0)])
	draw_colored_polygon(vertices, Color(color, 0.15))
	vertices.append(vertices[0])
	draw_polyline(vertices, color, 1.5, true)

func draw_ship() -> void:
	var facing := Vector2.UP
	if state == State.FLYING:
		facing = velocity.normalized()
	elif state == State.AIMING and launch_velocity().length() > 10:
		facing = launch_velocity().normalized()
	elif dock_body < bodies.size():
		facing = (ship - bodies[dock_body].position).normalized()
	var side := Vector2(-facing.y, facing.x)
	if state in [State.DOCKED, State.AIMING]:
		draw_arc(ship, 22 + 2 * sin(elapsed * 3), 0, TAU, 40, Color(TEAL, 0.4), 1, true)
	if state == State.FLYING:
		draw_colored_polygon(PackedVector2Array([ship - facing * 7 - side * 3, ship - facing * (15 + sin(elapsed * 40) * 3), ship - facing * 7 + side * 3]), GOLD)
	draw_colored_polygon(PackedVector2Array([ship + facing * 11, ship - facing * 7 + side * 8, ship - facing * 4, ship - facing * 7 - side * 8]), TEXT)
	draw_line(ship - side * 3, ship + side * 3, TEAL, 3, true)
