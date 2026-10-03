class_name OutpostRobot
extends Node3D
var t := 0.0
var home := Vector3.ZERO
var player: Node3D
func _ready() -> void:
	home = position
func _process(delta: float) -> void:
	t += delta
	var phase := fmod(t, 18.0)
	if phase < 12:
		var next := home + Vector3(sin(t * 0.24) * 3, 0, cos(t * 0.24) * 2)
		var heading := next - position
		if heading.length() > 0.01: rotation.y = atan2(heading.x, heading.z)
		position = position.move_toward(next, delta * 0.65)
	elif player and player.position.distance_to(position) < 4:
		var heading := player.position - position
		rotation.y = lerp_angle(rotation.y, atan2(heading.x, heading.z), delta * 2)
