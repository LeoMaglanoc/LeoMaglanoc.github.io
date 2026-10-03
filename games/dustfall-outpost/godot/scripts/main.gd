extends Node3D
var objective: OutpostObjective
var player: OutpostPlayer
var world: OutpostWorld
var interaction: OutpostInteraction
var bridge_callback: JavaScriptObject
var ui_timer := 0.0
var elapsed := 0.0
var visited: Array[String] = []
var notice := ""
var notice_time := 0.0
var flying := false
var flight_time := 0.0
var flight_camera: Camera3D
var qa := false
var paused := true
var audio_players: Dictionary = {}
var door_tween: Tween

func _ready() -> void:
	objective = OutpostObjective.new()
	add_child(objective)
	world = OutpostWorld.new()
	add_child(world)
	world.build()
	player = OutpostPlayer.new()
	player.position = Vector3(0,.1,14)
	player.enabled = false
	add_child(player)
	world.robot.player = player
	interaction = OutpostInteraction.new()
	interaction.player = player
	add_child(interaction)
	world.interacted.connect(on_interacted)
	objective.completed.connect(begin_completion)
	for name in ["wind","hum","pickup","door","engine"]:
		var sound := AudioStreamPlayer.new()
		var stream := load("res://audio/%s.wav" % name) as AudioStreamWAV
		if name in ["wind","hum"]:
			stream.loop_mode = AudioStreamWAV.LOOP_FORWARD
			stream.loop_end = int(stream.get_length() * stream.mix_rate)
		sound.stream = stream
		sound.volume_db = -6 if name == "wind" else -12
		add_child(sound)
		audio_players[name] = sound
	if OS.has_feature("web"):
		bridge_callback = JavaScriptBridge.create_callback(browser_input)
		JavaScriptBridge.get_interface("window").dustfallInput = bridge_callback
		qa = bool(JavaScriptBridge.eval("new URLSearchParams(location.search).has('qa')"))
		JavaScriptBridge.eval("window.dustfallReady = true; if(window.onDustfallReady) window.onDustfallReady();")
	else:
		paused = false
		player.enabled = true
		Input.mouse_mode = Input.MOUSE_MODE_CAPTURED

func browser_input(args: Array) -> void:
	var command = JSON.parse_string(str(args[0]))
	if not command is Dictionary: return
	match command.get("type",""):
		"start":
			player.touch_mode = bool(command.get("touch",false))
			paused = false
			player.enabled = not flying
			for id in ["wind","hum"]:
				if not audio_players[id].playing: audio_players[id].play()
		"pause":
			paused = true
			player.enabled = false
			player.touch_move = Vector2.ZERO
			player.velocity = Vector3.ZERO
			player.browser_move = Vector2.ZERO
			player.browser_sprint = false
		"keyboard":
			player.browser_move = Vector2(float(command.get("x",0)),float(command.get("y",0))) if not paused else Vector2.ZERO
			player.browser_sprint = bool(command.get("sprint",false)) and not paused
		"move":
			player.touch_move = Vector2(float(command.get("x",0)),float(command.get("y",0)))
		"look":
			if not paused: player.look(Vector2(float(command.get("x",0)),float(command.get("y",0))),.004)
		"mouse_look":
			if not paused: player.look(Vector2(float(command.get("x",0)),float(command.get("y",0))))
		"interact":
			if not paused and player.enabled: interaction.use()
		"mute":
			AudioServer.set_bus_mute(0,bool(command.get("value",false)))
		"quality":
			var low := bool(command.get("low",false))
			get_viewport().scaling_3d_scale = .7 if low else 1.0
			get_viewport().msaa_3d = Viewport.MSAA_DISABLED if low else Viewport.MSAA_2X
			for child in world.get_children():
				if child is DirectionalLight3D: child.shadow_enabled = not low
				if child is CPUParticles3D: child.emitting = not low
		"explore":
			flying = false
			paused = false
			player.enabled = true
			player.camera.current = true
			if flight_camera: flight_camera.queue_free()
		"qa_pose":
			if qa:
				player.position = Vector3(float(command.x),float(command.y),float(command.z))
				player.velocity = Vector3.ZERO
				player.yaw = float(command.get("yaw",0))
				player.pitch = float(command.get("pitch",0))
				player.rotation.y = player.yaw
				player.camera.rotation.x = player.pitch

func on_interacted(target: OutpostInteractable) -> void:
	match target.kind:
		"part":
			if objective.collect(target.part_id):
				target.available = false
				target.hide()
				target.collision_layer = 0
				world.get_node(target.part_id+"_ring").hide()
				audio_players.pickup.play()
				toast(target.title + " recovered" if objective.found.size()<3 else "All components recovered. Return to your ship.")
		"door":
			target.opened = not target.opened
			if door_tween and door_tween.is_valid(): door_tween.kill()
			door_tween = create_tween()
			# Move the door body and its collider together into the wall.
			door_tween.tween_property(target.visual,"position:x",14.5 if target.opened else 12.0,.7)
			audio_players.door.play()
		"ship":
			if not objective.repair(): toast("Search the market, workshop and old wreck for components.")
		"generator":
			if not target.opened:
				target.opened = true
				toast("Power restored. The relay has a pulse again.")
				audio_players.pickup.play()
				world.generator_label.text = "GRID ONLINE"
				world.generator_label.modulate = Color("6de2db")

func toast(text: String) -> void:
	notice = text
	notice_time = 5

func begin_completion() -> void:
	flying = true
	world.ship_body.collision_layer = 0
	world.ship_target.available = false
	world.ship_target.collision_layer = 0
	flight_time = 0
	player.enabled = false
	player.touch_move = Vector2.ZERO
	publish_state() # The browser shell releases pointer lock after receiving flying=true.
	if not OS.has_feature("web"): Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
	flight_camera = Camera3D.new()
	flight_camera.position = Vector3(12,6,35)
	flight_camera.fov = 60
	add_child(flight_camera)
	flight_camera.current = true
	flight_camera.look_at(world.ship.position+Vector3(0,2,0))
	audio_players.engine.play()
	toast("Repair complete. Engines online.")
	# Engine lights activate only when the ship is repaired.
	for x in [-2,2]:
		var light := OmniLight3D.new()
		light.position = Vector3(x,1.5,4)
		light.light_color = Color("ffad64")
		light.light_energy = 4
		light.omni_range = 5
		world.ship.add_child(light)

func _process(delta: float) -> void:
	elapsed += delta
	if not paused: notice_time = maxf(0,notice_time-delta)
	if flying and not paused:
		flight_time += delta
		if flight_time > 1.5:
			world.ship.position.y += delta*minf((flight_time-1.5)*1.3,8)
			world.ship.position.z -= delta*maxf(0,(flight_time-3)*2)
		if flight_camera: flight_camera.look_at(world.ship.position+Vector3(0,1.5,0))
	for label in world.landmarks:
		if label not in visited and player.position.distance_to(world.landmarks[label]) < 9:
			visited.append(label)
			if label != "Landing pad": toast(label + " discovered")
	ui_timer += delta
	if ui_timer >= .15:
		ui_timer = 0
		publish_state()

func publish_state() -> void:
	if not OS.has_feature("web"): return
	var heading := fposmod(-rad_to_deg(player.yaw),360)
	var data := {"parts":objective.found,"repaired":objective.repaired,"complete":flying and objective.repaired and flight_time>6,"flying":flying,"visited":visited,"prompt":interaction.target.get_prompt(objective) if interaction.target else "","notice":notice if notice_time>0 else "","paused":paused,"heading":heading,"fps":Engine.get_frames_per_second()}
	if qa:
		data["position"] = [player.position.x,player.position.y,player.position.z]
		data["yaw"] = player.yaw
		data["pitch"] = player.pitch
		data["door_open"] = world.door.opened
		data["mouse_mode"] = Input.mouse_mode
		data["physics_frame"] = Engine.get_physics_frames()
		data["generator_on"] = world.generator.opened
		data["target"] = interaction.target.part_id if interaction.target and interaction.target.kind=="part" else (interaction.target.kind if interaction.target else "")
	JavaScriptBridge.eval("window.dustfallState="+JSON.stringify(data)+"; if(window.updateDustfall) window.updateDustfall(window.dustfallState);")
