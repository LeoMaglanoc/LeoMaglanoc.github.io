extends RefCounted

const COLORS := [Color("67ddcf"), Color("eea968"), Color("9e91e8"), Color("71a5d8"), Color("df7b98")]
const NAMES := ["FIRST LIGHT", "TWIN TIDES", "THE SLINGSHOT", "LITTLE CONSTELLATION", "DOUBLE", "TRIANGLE", "MOON", "CORRIDOR", "VOID", "CHAOS"]

static func body(position: Vector2, radius: float, color_index: int, strength: float = 1.0) -> Dictionary:
	return {"position": position, "radius": radius, "mu": radius * radius * 75.0 * strength, "color": COLORS[color_index % COLORS.size()]}

static func generate(sector: int, run_seed: int) -> Dictionary:
	var rng := RandomNumberGenerator.new()
	rng.seed = run_seed + sector * 7919
	var bodies: Array = [body(Vector2(225, 675), 43, 0)]
	var gate := Vector2(250, 135)
	var template := sector if sector < 4 else 4 + (sector + run_seed) % 6
	match template:
		0:
			bodies.append(body(Vector2(128, 430), 48, 1, 0.85))
		1, 4:
			bodies.append(body(Vector2(140, 466), 51, 1))
			bodies.append(body(Vector2(328, 278), 47, 2))
		2, 6:
			bodies.append(body(Vector2(304, 443), 68, 2))
			bodies.append(body(Vector2(112, 248), 28, 1, 0.7))
			gate = Vector2(320, 135)
		3, 5:
			bodies.append(body(Vector2(112, 495), 41, 1))
			bodies.append(body(Vector2(333, 420), 48, 2))
			bodies.append(body(Vector2(181, 233), 39, 3))
		7:
			bodies.append(body(Vector2(120, 505), 39, 1))
			bodies.append(body(Vector2(326, 362), 44, 2))
			bodies.append(body(Vector2(108, 211), 35, 3))
		8:
			bodies.append(body(Vector2(345, 397), 32, 3, 0.65))
			gate = Vector2(150, 130)
		9:
			for i in 4:
				bodies.append(body(Vector2(110 + (i % 2) * 218, 550 - i * 112), 28, i + 1, 0.7))
	if sector >= 4:
		# Conservative jitter preserves roomy, authored corridors.
		for i in range(1, bodies.size()):
			bodies[i].position += Vector2(rng.randf_range(-16, 16), rng.randf_range(-12, 12))
			bodies[i].mu *= rng.randf_range(0.85, 1.1) * minf(1.25, 1 + sector * 0.012)
		gate.x += rng.randf_range(-18, 18)
	var scraps: Array = []
	var candidates: Array[Vector2] = [Vector2(237, 585), Vector2(249, 535), Vector2(240, 479), Vector2(230, 365), Vector2(233, 309), Vector2(251, 242), Vector2(282, 197), Vector2(80, 340), Vector2(372, 537), Vector2(85, 590), Vector2(364, 212)]
	for i in candidates.size():
		var p: Vector2 = candidates[i]
		if sector >= 4:
			p += Vector2(rng.randf_range(-15, 15), rng.randf_range(-12, 12))
		var valid := true
		for b in bodies:
			if p.distance_to(b.position) < b.radius + 24:
				valid = false
		if valid and p.distance_to(gate) > 40:
			scraps.append({"position": p, "rare": i >= 7, "collected": false})
	return {"bodies": bodies, "gate": gate, "scraps": scraps, "name": NAMES[template], "template": template}
