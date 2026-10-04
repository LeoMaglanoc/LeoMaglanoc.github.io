extends SceneTree
func _initialize() -> void:
	var orders := [
		["power_cell","navigation_module","coolant_unit"],
		["power_cell","coolant_unit","navigation_module"],
		["navigation_module","power_cell","coolant_unit"],
		["navigation_module","coolant_unit","power_cell"],
		["coolant_unit","power_cell","navigation_module"],
		["coolant_unit","navigation_module","power_cell"]
	]
	for order in orders:
		var objective := OutpostObjective.new()
		var counts := {"changed":0,"completed":0}
		objective.changed.connect(func(): counts.changed += 1)
		objective.completed.connect(func(): counts.completed += 1)
		assert(not objective.repair(), "Cannot repair without components")
		assert(not objective.collect("unknown"), "Unknown components rejected")
		for id in order:
			assert(objective.collect(id))
			assert(not objective.collect(id), "No duplicate pickups")
			if objective.found.size()<3:
				assert(not objective.repair(), "Missing components prevent repair")
		assert(objective.repair(), "All pickup orders can complete")
		assert(not objective.repair(), "Completion happens once")
		assert(counts.changed==3 and counts.completed==1, "Only valid transitions emit signals")
		objective.free()
	print("Objective checks passed: six pickup orders, duplicate/unknown rejection, single completion")
	quit()
