class_name OutpostInteractable
extends StaticBody3D
signal used(target)
var kind := ""
var title := ""
var part_id := ""
var available := true
var opened := false
var visual: Node3D
var initial_y := 0.0

func setup(type: String, label: String, size: Vector3) -> void:
	kind = type
	title = label
	collision_layer = 2
	var shape := CollisionShape3D.new()
	var box := BoxShape3D.new()
	box.size = size
	shape.shape = box
	add_child(shape)

func get_prompt(objective: OutpostObjective) -> String:
	if kind == "part": return "TAKE " + title.to_upper()
	if kind == "door": return "CLOSE WORKSHOP" if opened else "OPEN WORKSHOP"
	if kind == "ship":
		return "REPAIR SHIP" if objective.found.size() == 3 else "SHIP NEEDS %d COMPONENTS" % (3 - objective.found.size())
	return "RESTORE GENERATOR" if not opened else "GENERATOR ONLINE"

func interact() -> void:
	if available: used.emit(self)
