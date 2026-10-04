# Coruscant Temple — agreed implementation

Build a separate Godot Web project in `projects/block-temple`, reusing the controller,
chunk meshes, DDA interaction, touch controls and save concept from Block World.
Preserve the published Block World project.

## Accepted direction

- Recreate the intact Coruscant / Jedi Temple map from classic Battlefront II.
- Use the overhead map, five images and Knightfall walkthrough in `references/`.
- Reconstruct geometry and materials from observation; do not extract game assets.
- Preserve the recognizable hall, apse, perimeter corridors, circular chambers,
  council room, archive and connected antechamber. Restore fallen columns upright.
- Keep mining and building. Put a mineable service entrance, resources, hidden
  passage and construction-only overlook in a discreet extension to the map.
- First-person exploration, no combat, NPCs, vehicles or multiplayer.
- Desktop fidelity first; mobile Eco setting, landscape touch controls.

## Work and acceptance

1. Establish a dimensioned map and Blender greybox. Retain 1.75 m player scale.
2. Export GLB with separate static collision, integrate Godot and web controls.
3. Implement static/voxel closest-hit targeting, bounded placement, collision
   checks, resource collection, saves, safe recovery and reset.
4. Complete intact modular architecture, inlaid floors, fluted columns, framed
   windows, council seating, archive shelving and exterior city silhouettes.
5. Add wayfinding, mine/build objective, secret reveal and overlook reward.
6. Validate Blender naming/bounds/geometry/export; inspect fixed renders and MCP.
7. Run Godot mechanics and progression checks, export Web and exercise it with
   Chrome computer use. Also test narrow landscape touch, Eco, reload and reset.
8. Deliver reproducible scripts, editable .blend, source, web export, website
   route and an honest validation report with reference reconstruction limits.

The references do not supply a complete dimensioned model. Record inferred room
connections and proportions, and compare matching views rather than asserting
an exact replica without evidence. Desktop screenshots and measured browser
performance are acceptance evidence; physical phone performance needs a device.
