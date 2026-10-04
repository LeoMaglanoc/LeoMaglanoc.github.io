extends SceneTree
var materials := {}
var surfaces := 0
func _initialize() -> void:
	call_deferred("inspect_world")
func inspect_world() -> void:
	var world := OutpostWorld.new()
	root.add_child(world)
	world.build()
	inspect_node(world)
	print("World surfaces: ",surfaces,"; distinct materials: ",materials.size())
	quit()
func inspect_node(node: Node) -> void:
	if node is MeshInstance3D:
		for surface in range(node.mesh.get_surface_count()):
			surfaces += 1
			var material: Material = node.get_active_material(surface)
			if material: materials[material.get_instance_id()] = material.resource_name
	for child in node.get_children(): inspect_node(child)
