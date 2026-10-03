# Robot World

A little original voxel island with twelve curious robots. Built with Godot
4.7.2, GDScript, Compatibility rendering, and a single-threaded static web export.
Play at https://leonardo-maglanoc.com/block-world/.

Turn your phone sideways. Use the left joystick to move and drag the world on
the right to look. The separate jump, break, place and hello buttons support
multiple fingers. Choose seven quick-access blocks or open the twelve-block
palette. Fullscreen is available from the menu and during play; supported
browsers also lock landscape orientation. Unsupported fullscreen/orientation
APIs fall back to the ordinary landscape browser view.

Desktop: WASD moves, Space jumps, drag to look or click the world to capture the
mouse. With the mouse captured, left click breaks and right click places.
Right click also places without capture. 1–9 and the wheel select blocks, E
waves to a nearby robot, Escape pauses. F3 (or `?debug=1`) shows diagnostics.

## Docker workflow

```sh
cd games/block-world
docker compose build tools
docker compose run --rm tools ./scripts/build_web.sh
docker compose run --rm tools ./scripts/validate.sh
./scripts/test_browser.sh
docker compose up -d preview
```

Open http://localhost:8097/assets/interactive/block-world/index.html. The first
load downloads Godot's ~38 MB raw WASM runtime; game data is ~30 KB. No remote
assets or services are needed during play. Source, export templates and engine
licenses are pinned to the same official engine version. Docker installs all
build/test dependencies; no local Godot or Node installation is required.

For the full site:

```sh
./scripts/run_local.sh --site
```

Open http://localhost:8098/block-world/. Stop previews with `docker compose down`.

## Implementation

- `godot/scripts/world.gd`: seeded 96×96×32 finite island, original atlas, trees,
  voxel lab and charging pads, compact byte arrays, exposed-face chunk meshes
  and one terrain collider per chunk. Edits dirty only touching chunks.
  Exact grid ray traversal supplies the hit and placement voxel.
- `godot/scripts/game.gd`: capsule player, gravity/jump, self-intersection checks,
  batched loading, selection feedback, persistence, reset and diagnostics.
- `godot/scripts/robot.gd`: three cosmetic families, procedural limbs, grid-aware
  local wandering, player attention, wave animation, hole avoidance and recovery.
  Robot destinations bias wandering; they do not use a navigation service.
- `godot/web_shell.html`: safe-area HTML controls around the canvas, independent
  captured touch pointers, fullscreen, orientation hint, focus/visibility
  cancellation, palette, sample-free synthesized Web Audio effects and mute.
- Saves use `localStorage`, versioned seed plus block deviations, player position,
  camera and selected block. A denied/full store shows a saving notice. Changes
  save after editing, periodically during play and when the game pauses.
  Reset requires confirmation. Returning to a blocked saved position finds a
  safe spawn. Browser storage can be cleared or unavailable in private sessions.
- Standard rendering uses 75% resolution; Eco uses 50%. The HTML controls remain
  full resolution. Terrain is unshaded with baked face shading; no shadows/GI.
  Fog and distance culling bound the view. Glass is deliberately opaque for
  readability and lower transparency cost; Core is a bright gold atlas tile.
- Browser telemetry is read-only; tests use real keyboard/mouse/CDP touch events.
  No teleport, edit or game-state mutation endpoint is exposed.

See `VALIDATION.md` for observed checks and device limitations. Published files
live in `assets/interactive/block-world/`. Jekyll excludes source/tooling and
serves `/block-world/`, linked from the AI Coding Agent Case Study blogpost.

The texture atlas, geometry and sounds are original. See `LICENSES.md` and the
engine notices accompanying the published export.
