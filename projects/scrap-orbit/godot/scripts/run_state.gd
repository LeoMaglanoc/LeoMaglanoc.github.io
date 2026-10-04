extends RefCounted

const UPGRADES := [
	{"name": "THRUSTERS", "description": "+12% launch power", "icon": "01"},
	{"name": "MAGNET", "description": "+30% salvage reach", "icon": "02"},
	{"name": "NAVIGATION", "description": "See farther into your flight", "icon": "03"},
	{"name": "LANDING GEAR", "description": "+18% safe landing speed", "icon": "04"},
	{"name": "SHIELD CELL", "description": "Restore one shield", "icon": "05"},
	{"name": "SCANNER", "description": "+50% rare salvage value", "icon": "06"},
	{"name": "GRAVITY SENSOR", "description": "Mark close-orbit opportunities", "icon": "07"}
]
var sector := 0
var score := 0
var shields := 3
var power := 420.0
var magnet := 29.0
var prediction_steps := 720
var landing_speed := 245.0
var rare_value := 25
var sensor := false
var levels := [0, 0, 0, 0, 0, 0, 0]
var sector_salvage := 0
var sector_near_misses := 0

func apply_upgrade(id: int) -> void:
	levels[id] += 1
	match id:
		0: power = minf(650, power * 1.12)
		1: magnet = minf(85, magnet * 1.3)
		2: prediction_steps = mini(1440, prediction_steps + 180)
		3: landing_speed = minf(430, landing_speed * 1.18)
		4: shields = mini(5, shields + 1)
		5: rare_value += 13
		6: sensor = true

func collect(scrap: Dictionary) -> int:
	if scrap.collected:
		return 0
	scrap.collected = true
	var value: int = rare_value if scrap.rare else 10
	score += value
	sector_salvage += value
	return value

func complete() -> int:
	var bonus := 50 + sector * 15
	score += bonus
	return bonus

func choices(run_seed: int) -> Array[int]:
	var ids: Array[int] = []
	var rng := RandomNumberGenerator.new()
	rng.seed = run_seed + sector * 397
	while ids.size() < 3:
		var id := rng.randi_range(0, 6)
		if id in ids or (id == 6 and sensor) or (id == 4 and shields >= 5):
			continue
		ids.append(id)
	return ids
