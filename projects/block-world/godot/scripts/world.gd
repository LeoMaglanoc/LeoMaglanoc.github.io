extends Node3D
class_name VoxelIsland

const SIZE = 96
const HEIGHT = 32
const CHUNK = 16
const NAMES = ["Air", "Grass", "Dirt", "Stone", "Sand", "Wood", "Leaves", "Brick", "Glass", "Lab", "Metal", "Tech", "Core"]
const COLORS = [Color.TRANSPARENT, Color("8dbf60"), Color("a47952"), Color("9aa9ad"), Color("e7d5a1"), Color("ae8159"), Color("529b6b"), Color("cc7965"), Color("b9e5ed"), Color("edf1de"), Color("455d6a"), Color("51bacc"), Color("f9cf65")]
const DIRS = [Vector3i(1,0,0), Vector3i(-1,0,0), Vector3i(0,1,0), Vector3i(0,-1,0), Vector3i(0,0,1), Vector3i(0,0,-1)]
# Clockwise winding from outside, as required by Godot.
const FACES = [
	[Vector3(1,0,0),Vector3(1,1,0),Vector3(1,1,1),Vector3(1,0,1)],
	[Vector3(0,0,1),Vector3(0,1,1),Vector3(0,1,0),Vector3(0,0,0)],
	[Vector3(0,1,1),Vector3(1,1,1),Vector3(1,1,0),Vector3(0,1,0)],
	[Vector3(0,0,0),Vector3(1,0,0),Vector3(1,0,1),Vector3(0,0,1)],
	[Vector3(1,0,1),Vector3(1,1,1),Vector3(0,1,1),Vector3(0,0,1)],
	[Vector3(0,0,0),Vector3(0,1,0),Vector3(1,1,0),Vector3(1,0,0)]]
var blocks = PackedByteArray()
var original = PackedByteArray()
var chunks: Dictionary = {}
var dirty: Dictionary = {}
var changes: Dictionary = {}
var material: StandardMaterial3D
var seed_value = 1701
var stations = [Vector2i(48,38), Vector2i(33,48), Vector2i(63,48), Vector2i(51,61)]
var triangles = 0

func index(p: Vector3i) -> int:
	return (p.z * SIZE + p.x) * HEIGHT + p.y

func inside(p: Vector3i) -> bool:
	return p.x >= 0 and p.x < SIZE and p.z >= 0 and p.z < SIZE and p.y >= 0 and p.y < HEIGHT

func get_block(p: Vector3i) -> int:
	return blocks[index(p)] if inside(p) else 0

func raw_set(p: Vector3i, id: int) -> void:
	if inside(p): blocks[index(p)] = id

func surface(x: int, z: int) -> int:
	for y in range(HEIGHT - 1, -1, -1):
		var id = get_block(Vector3i(x,y,z))
		if id != 0: return y + 1
	return 0

func ground(x: int, z: int) -> int:
	# Highest floor with two blocks of clearance; robots can navigate player edits.
	for y in range(HEIGHT - 3, 2, -1):
		if get_block(Vector3i(x,y,z)) != 0 and get_block(Vector3i(x,y+1,z)) == 0 and get_block(Vector3i(x,y+2,z)) == 0:
			return y + 1
	return 0

func generate(seed_number: int) -> void:
	seed_value = seed_number
	changes.clear()
	blocks.resize(SIZE * SIZE * HEIGHT)
	blocks.fill(0)
	var noise = FastNoiseLite.new()
	noise.seed = seed_value
	noise.frequency = 0.045
	var rng = RandomNumberGenerator.new()
	rng.seed = seed_value
	for z in SIZE:
		for x in SIZE:
			var distance = Vector2(x - 48,z - 48).length()
			var h = clampi(int(9 + noise.get_noise_2d(x,z) * 5 - maxf(0,distance - 31) * 0.5), 2, 16)
			if x >= 29 and x <= 67 and z >= 31 and z <= 64: h = 9
			for y in h:
				raw_set(Vector3i(x,y,z), (4 if h <= 5 else 1) if y == h - 1 else (2 if y >= h - 3 else 3))
	for z in range(13,84,5):
		for x in range(13,84,5):
			var tx = x + rng.randi_range(-2,2)
			var tz = z + rng.randi_range(-2,2)
			var h = surface(tx,tz)
			if h < 6 or (tx > 27 and tx < 69 and tz > 29 and tz < 66) or rng.randf() > 0.65: continue
			for y in range(h,h+4): raw_set(Vector3i(tx,y,tz),5)
			for dy in range(2,6):
				for dx in range(-2,3):
					for dz in range(-2,3):
						if abs(dx)+abs(dz) <= (2 if dy == 5 else 3) and get_block(Vector3i(tx+dx,h+dy,tz+dz)) == 0:
							raw_set(Vector3i(tx+dx,h+dy,tz+dz),6)
	# Open-front laboratory: a welcoming place to build, all ordinary blocks.
	for x in range(43,54):
		for z in range(33,42):
			raw_set(Vector3i(x,8,z),10)
			if z == 33 or x == 43 or x == 53:
				for y in range(9,13): raw_set(Vector3i(x,y,z),8 if y in [10,11] and z == 33 and x > 44 and x < 52 else 9)
			if z < 37: raw_set(Vector3i(x,13,z),11)
	for x in [45,48,51]:
		raw_set(Vector3i(x,9,35),10)
		raw_set(Vector3i(x,10,35),12)
	# Charging pads, workshop bench and observation antenna.
	for s in stations:
		for dx in range(-2,3):
			for dz in range(-2,3): raw_set(Vector3i(s.x+dx,8,s.y+dz),11 if abs(dx)+abs(dz)<2 else 10)
	for y in range(9,16): raw_set(Vector3i(63,y,48),10)
	for dx in range(-2,3): raw_set(Vector3i(63+dx,15,48),12 if dx == 0 else 11)
	for x in range(30,36): raw_set(Vector3i(x,9,46),7)
	original = blocks.duplicate()
	material = StandardMaterial3D.new()
	material.albedo_texture = load("res://textures/blocks.png")
	material.texture_filter = BaseMaterial3D.TEXTURE_FILTER_NEAREST
	material.vertex_color_use_as_albedo = true
	material.roughness = 1.0
	material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED

func apply_changes(saved: Dictionary) -> void:
	for key in saved:
		var parts = str(key).split(",")
		if parts.size() != 3: continue
		var p = Vector3i(int(parts[0]),int(parts[1]),int(parts[2]))
		var id = int(saved[key])
		if inside(p) and p.y > 0 and id >= 0 and id <= 12:
			raw_set(p,id)
			changes[str(key)] = id

func edit(p: Vector3i, id: int) -> bool:
	if not inside(p) or p.y == 0 or id < 0 or id > 12 or get_block(p) == id: return false
	raw_set(p,id)
	var key = "%d,%d,%d" % [p.x,p.y,p.z]
	if original[index(p)] == id: changes.erase(key)
	else: changes[key] = id
	for offset in [Vector3i.ZERO,Vector3i(1,0,0),Vector3i(-1,0,0),Vector3i(0,0,1),Vector3i(0,0,-1)]:
		var q = p + offset
		if inside(q): dirty[Vector2i(q.x / CHUNK,q.z / CHUNK)] = true
	return true

func rebuild(c: Vector2i) -> void:
	var verts = PackedVector3Array()
	var normals = PackedVector3Array()
	var colors = PackedColorArray()
	var uvs = PackedVector2Array()
	var uv = [Vector2(0,1),Vector2(0,0),Vector2(1,0),Vector2(1,1)]
	for z in range(c.y*CHUNK,(c.y+1)*CHUNK):
		for x in range(c.x*CHUNK,(c.x+1)*CHUNK):
			for y in HEIGHT:
				var p = Vector3i(x,y,z)
				var id = get_block(p)
				if id == 0: continue
				for f in 6:
					if get_block(p+DIRS[f]) != 0: continue
					var shade = [0.80,0.72,1.0,0.55,0.88,0.76][f]
					# Atlas tiles carry original pixel patterns, colors remain readable at distance.
					var tile = id-1
					for k in [0,2,1,0,3,2]:
						verts.append(Vector3(p)+FACES[f][k])
						normals.append(Vector3(DIRS[f]))
						colors.append(Color(shade,shade,shade))
						uvs.append((Vector2(tile % 4,tile / 4)+uv[k]*0.94+Vector2(0.03,0.03))/Vector2(4,4))
	if chunks.has(c):
		remove_child(chunks[c])
		chunks[c].queue_free()
	var root = StaticBody3D.new()
	root.collision_layer = 1
	root.collision_mask = 0
	add_child(root)
	chunks[c] = root
	if verts.is_empty(): return
	var arrays = []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = verts
	arrays[Mesh.ARRAY_NORMAL] = normals
	arrays[Mesh.ARRAY_COLOR] = colors
	arrays[Mesh.ARRAY_TEX_UV] = uvs
	var mesh = ArrayMesh.new()
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
	mesh.surface_set_material(0,material)
	var visual = MeshInstance3D.new()
	visual.mesh = mesh
	root.add_child(visual)
	var collider = CollisionShape3D.new()
	collider.shape = mesh.create_trimesh_shape()
	root.add_child(collider)
	dirty.erase(c)

func ray(origin: Vector3, direction: Vector3, reach: float = 5.5) -> Dictionary:
	# Grid traversal: exact first voxel and face, independent of deferred physics mesh updates.
	var p = Vector3i(floor(origin.x),floor(origin.y),floor(origin.z))
	var step = Vector3i(1 if direction.x >= 0 else -1,1 if direction.y >= 0 else -1,1 if direction.z >= 0 else -1)
	var delta = Vector3(1/absf(direction.x) if absf(direction.x)>0.00001 else INF,1/absf(direction.y) if absf(direction.y)>0.00001 else INF,1/absf(direction.z) if absf(direction.z)>0.00001 else INF)
	var tmax = Vector3((p.x+(1 if step.x>0 else 0)-origin.x)/direction.x if delta.x<INF else INF,(p.y+(1 if step.y>0 else 0)-origin.y)/direction.y if delta.y<INF else INF,(p.z+(1 if step.z>0 else 0)-origin.z)/direction.z if delta.z<INF else INF)
	var prev = p
	var distance = 0.0
	while distance <= reach:
		if get_block(p) != 0: return {"block":p,"place":prev,"distance":distance}
		prev = p
		if tmax.x <= tmax.y and tmax.x <= tmax.z:
			distance = tmax.x
			p.x += step.x
			tmax.x += delta.x
		elif tmax.y <= tmax.z:
			distance = tmax.y
			p.y += step.y
			tmax.y += delta.y
		else:
			distance = tmax.z
			p.z += step.z
			tmax.z += delta.z
	return {}
