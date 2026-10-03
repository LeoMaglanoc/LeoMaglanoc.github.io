class_name OutpostObjective
extends Node
signal changed
signal completed
const PARTS := ["power_cell", "navigation_module", "coolant_unit"]
var found: Array[String] = []
var repaired := false

func collect(id: String) -> bool:
	if id not in PARTS or id in found or repaired:
		return false
	found.append(id)
	changed.emit()
	return true

func repair() -> bool:
	if found.size() != PARTS.size() or repaired:
		return false
	repaired = true
	completed.emit()
	return true
