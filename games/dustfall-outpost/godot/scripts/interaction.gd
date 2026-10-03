class_name OutpostInteraction
extends Node
var player: OutpostPlayer
var target: OutpostInteractable

func _physics_process(_delta: float) -> void:
	if not player or not player.enabled:
		target = null
		return
	var camera := player.camera
	var query := PhysicsRayQueryParameters3D.create(camera.global_position, camera.global_position - camera.global_transform.basis.z * 3.6, 3, [player.get_rid()])
	var hit := player.get_world_3d().direct_space_state.intersect_ray(query)
	var collider = hit.get("collider")
	target = collider as OutpostInteractable
	if not target and collider is Node and collider.has_meta("interactable"):
		target = collider.get_meta("interactable") as OutpostInteractable
	if target and not target.available: target = null

func use() -> void:
	if target: target.interact()
