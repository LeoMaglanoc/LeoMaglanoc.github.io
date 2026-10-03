class_name OutpostPlayer
extends CharacterBody3D
var camera: Camera3D
var yaw := 0.0
var pitch := 0.0
var touch_move := Vector2.ZERO
var browser_move := Vector2.ZERO
var browser_sprint := false
var enabled := true
var touch_mode := false
var footsteps_distance := 0.0

func _ready() -> void:
	var shape := CollisionShape3D.new()
	var capsule := CapsuleShape3D.new()
	capsule.radius = 0.32
	capsule.height = 1.75
	shape.shape = capsule
	shape.position.y = 0.9
	add_child(shape)
	camera = Camera3D.new()
	camera.position.y = 1.65
	camera.fov = 76
	camera.near = 0.08
	camera.far = 260
	add_child(camera)
	floor_snap_length = 0.35
	floor_max_angle = deg_to_rad(46)

func look(delta: Vector2, sensitivity: float = 0.0025) -> void:
	if not enabled: return
	yaw -= delta.x * sensitivity
	pitch = clampf(pitch - delta.y * sensitivity, -1.25, 1.25)
	rotation.y = yaw
	camera.rotation.x = pitch

func _unhandled_input(event: InputEvent) -> void:
	if not OS.has_feature("web") and event is InputEventMouseMotion and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED and not touch_mode:
		look(event.relative)

func _physics_process(delta: float) -> void:
	var move := touch_move
	if OS.has_feature("web") and not touch_mode:
		move = browser_move
	elif not touch_mode:
		move = Vector2(float(Input.is_physical_key_pressed(KEY_D)) - float(Input.is_physical_key_pressed(KEY_A)), float(Input.is_physical_key_pressed(KEY_S)) - float(Input.is_physical_key_pressed(KEY_W)))
	if not enabled: move = Vector2.ZERO
	if move.length() > 1: move = move.normalized()
	var direction := transform.basis * Vector3(move.x, 0, move.y)
	var speed := 4.4
	if not touch_mode and ((browser_sprint and OS.has_feature("web")) or (not OS.has_feature("web") and Input.is_physical_key_pressed(KEY_SHIFT))): speed = 6.8
	velocity.x = move_toward(velocity.x, direction.x * speed, delta * 18)
	velocity.z = move_toward(velocity.z, direction.z * speed, delta * 18)
	if not is_on_floor(): velocity.y -= 20 * delta
	else: velocity.y = -0.5
	move_and_slide()
	if position.y < -8: position = Vector3(0, 1, 14)
