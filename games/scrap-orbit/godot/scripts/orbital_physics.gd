extends RefCounted

const DT := 1.0 / 120.0
const SOFTENING := 24.0
const MAX_ACCELERATION := 180.0
const SHIP_RADIUS := 7.0

static func acceleration(position: Vector2, bodies: Array) -> Vector2:
	var force := Vector2.ZERO
	for body in bodies:
		var offset: Vector2 = body.position - position
		var d2: float = offset.length_squared() + SOFTENING * SOFTENING
		force += offset * (float(body.mu) / (d2 * sqrt(d2)))
	return force.limit_length(MAX_ACCELERATION)

# Semi-implicit Euler. Preview and flight both call this exact fixed step.
static func step(position: Vector2, velocity: Vector2, bodies: Array) -> Array[Vector2]:
	var next_velocity := velocity + acceleration(position, bodies) * DT
	return [position + next_velocity * DT, next_velocity]

static func segment_distance(a: Vector2, b: Vector2, point: Vector2) -> float:
	var delta := b - a
	var fraction := clampf((point - a).dot(delta) / maxf(delta.length_squared(), 0.0001), 0.0, 1.0)
	return point.distance_to(a + delta * fraction)

static func collision(a: Vector2, b: Vector2, bodies: Array) -> int:
	for i in bodies.size():
		if segment_distance(a, b, bodies[i].position) <= float(bodies[i].radius) + SHIP_RADIUS:
			return i
	return -1

static func safe_impact(velocity: Vector2, threshold: float) -> bool:
	return velocity.length() <= threshold

static func outside(position: Vector2) -> bool:
	return position.x < -45 or position.x > 495 or position.y < 55 or position.y > 815

static func predict(position: Vector2, velocity: Vector2, bodies: Array, gate: Vector2, steps: int, safe_speed: float) -> Dictionary:
	var points := PackedVector2Array([position])
	var result := "drift"
	var end := position
	for i in steps:
		var next := step(position, velocity, bodies)
		var hit := collision(position, next[0], bodies)
		if segment_distance(position, next[0], gate) < 27:
			result = "gate"
			end = next[0]
			break
		if hit >= 0:
			result = "landing" if safe_impact(next[1], safe_speed) else "crash"
			end = next[0]
			break
		position = next[0]
		velocity = next[1]
		end = position
		if i % 8 == 0:
			points.append(position)
		if outside(position):
			result = "lost"
			break
	points.append(end)
	return {"points": points, "result": result, "end": end}
