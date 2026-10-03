extends SceneTree
const Physics = preload("res://scripts/orbital_physics.gd")
const Generator = preload("res://scripts/sector_generator.gd")
var failures := 0
func _initialize() -> void:
	for index in 10:
		var sector := Generator.generate(index, 1701)
		var start: Vector2 = sector.bodies[0].position + Vector2(0, -sector.bodies[0].radius - 10)
		var route := solve(sector, start)
		if route.is_empty():
			failures += 1
			printerr("FAIL: no route sector ", index + 1)
		else:
			print("REACHABLE sector ", index + 1, " launches ", route.size(), " velocities ", route)
	print("REACHABILITY: 10 layouts, ", failures, " failures")
	quit(1 if failures else 0)

func solve(sector: Dictionary, start: Vector2) -> Array:
	var queue: Array = [{"position": start, "route": []}]
	var visited: Dictionary = {}
	while not queue.is_empty():
		var node: Dictionary = queue.pop_front()
		var towards: Vector2 = (sector.gate - node.position).normalized()
		for speed in range(40, 421, 20):
			for angle in range(-90, 91, 6):
				var v := towards.rotated(deg_to_rad(angle)) * speed
				var prediction := Physics.predict(node.position, v, sector.bodies, sector.gate, 1800, 245)
				if prediction.result == "gate":
					return node.route + [v]
				if prediction.result != "landing" or node.route.size() >= 2:
					continue
				for i in range(1, sector.bodies.size()):
					var body: Dictionary = sector.bodies[i]
					if prediction.end.distance_to(body.position) > body.radius + 10:
						continue
					var normal: Vector2 = (prediction.end - body.position).normalized()
					var key := "%d:%d" % [i, int(rad_to_deg(normal.angle()) / 15)]
					if not visited.has(key):
						visited[key] = true
						queue.append({"position": body.position + normal * (body.radius + 10), "route": node.route + [v]})
	return []
