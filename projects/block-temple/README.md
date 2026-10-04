# Coruscant Temple

An explorable reconstruction of the **intact Coruscant Jedi Temple map from
classic Battlefront II**, with a separate mining and construction discovery.
Architecture and materials were authored from the supplied screenshots, overhead
map and walkthrough. The existing Robot World remains unchanged.

Walk the ceremonial axis and its intact galleries, west and east corridors,
council chamber, meditation chamber, southern rotunda, antechamber and blue-lit
archives. At the east end of the transverse hallway, mine the cracked service
entrance. Recover stock inside the annex and build your own stairs or pillar
route to the city overlook, six metres above the floor.

This is a reference reconstruction, not an extracted or dimensionally exact
copy. The references show the damaged campaign variant and do not expose every
intact surface or measurement. Room dimensions, some connecting spaces and the
restored galleries are inferred. The service annex and construction objective
are additions. There is no combat or character content.

## Play locally

From the repository root:

```sh
./projects/block-temple/scripts/run_local.sh
```

Open <http://localhost:8099/assets/interactive/block-temple/index.html>.
The Jekyll website route is `/block-temple/` after building the site.
Nothing has been deployed or pushed by this task.

Desktop: WASD, drag the scene to look or click to capture the mouse, Space to
jump, left click to mine and right click to place. Use 1–9, the wheel or palette
to select materials. E opens the map; R toggles auto-walk. Escape pauses. The
visible action buttons also work on desktop. Permanent architecture cannot be
mined. All palette materials use the shared recovered-block inventory.

Phone: landscape, left joystick, drag on the right to look, Jump/Break/Place
buttons. Independent pointer IDs preserve movement while another finger looks
or jumps. Touch defaults to Eco (55% canvas resolution). Desktop rendering is capped at
1280 pixels wide; HTML controls retain their full resolution. The menu can explicitly
select touch controls on a desktop or tablet. Fullscreen and landscape lock use
browser APIs with a regular-view fallback.

Saves use the separate `coruscant-temple-v2` storage key. Voxel deltas, position,
yaw/pitch, inventory, selected material and discoveries persist. Invalid cells
are rejected; unsafe player positions recover to the hall entrance. Reset has a
confirmation and restores the intact base world and sealed service door.

## Rebuild

Requires Blender 5.2, Godot 4.7.2 plus matching web export templates, Python 3
with Pillow, Node and `rg`. Use the locally installed binaries, or supply paths:

```sh
BLENDER_BIN=/snap/bin/blender GODOT_BIN=/path/to/godot \
  ./projects/block-temple/scripts/build_all.sh
```

The script regenerates the `.blend`, validates its scene and exports a GLB,
renders seven fixed inspection views, imports Godot, runs mechanics and input
checks, and exports the static web game. Diagnostic logs are checked for errors
rather than relying solely on exit codes. `RENDER_CHECKS=0` skips fresh renders
when iterating code; review renders after architecture changes.

`Dockerfile` / `docker-compose.yml` provide the pinned Godot tools from the
existing Block World workflow. Generate/export the Blender asset on the host,
then use `docker compose build tools` and `docker compose run --rm tools
./scripts/build_web.sh` from this project. Run `./scripts/validate.sh` in the
same tools container. Source references are outside the runtime/export.

## Files

- `blender/scripts/build_modules.py`: repeatable module kit and layout. The kit
  includes column profiles, doors, slabs, stairs, galleries, window frames,
  seating, archive stacks and tower silhouettes. Geometry is batched by room
  and material for web rendering.
- `blender/coruscant_temple.blend`: editable authoring scene with metric scale,
  named collections, fixed player-height cameras and separate collision meshes.
- `blender/city_window.png`: original painted skyline texture for opaque windows.
- `blender/scripts/validate_scene.py`, `export_glb.py`, `render_checks.py`: asset
  checks, GLB interchange and inspection views.
- `godot/assets/coruscant_temple.glb`: authored architecture and `-colonly`
  collision meshes. Cameras and authoring lights are excluded.
- `godot/assets/layout.json`: named room bounds and spawn/overlook markers.
- `godot/scripts/world.gd`: adapted chunked voxel storage, exposed-face meshes,
  DDA targeting, gameplay bounds and delta saves, reusing Block World.
- `godot/scripts/game.gd`: controller, static/voxel closest-hit query, placement
  overlap tests, inventory, progression, stair stepping and room visibility.
- `godot/web_shell.html`: retained input bridge with temple UI, map and palette.
- `tests/mechanics.gd`: voxel/collision/targeting/controller/construction tests.
- `tests/shell.cjs`: actual web-shell code tested in a DOM fixture, including
  independent touch IDs, cancellation, input, map, quality and storage isolation.

`?debug=1` or F3 shows frame rate, draws, triangles, chunks, edits, CPU/physics
cost and WebGL renderer. Room-based visibility keeps neighbours visible around
portals. Architecture uses baked vertex shading rather than live PBR lighting. There
are no dynamic shadows or GI requirements, and the skyline is an
opaque-window illusion. See `VALIDATION.md` for actual Chrome evidence and limits.

## References and notices

The user supplied five images and the Knightfall video under `references/`.
They are reference inputs and are not bundled into the game. Every shipped
mesh, texture and sound was created for this project or inherited from the
original Block World implementation. No meshes, textures, audio or character
models were extracted from Battlefront. The fan reconstruction is unaffiliated
with the original rights holders; Star Wars and Battlefront names belong to
their respective owners. Godot MIT and third-party notices accompany the export.

Godot's [scene import conventions](https://docs.godotengine.org/en/stable/tutorials/assets_pipeline/importing_3d_scenes/node_type_customization.html)
and [physics queries](https://docs.godotengine.org/en/stable/classes/class_physicsdirectspacestate3d.html)
were used for the GLB collision/interaction integration.
