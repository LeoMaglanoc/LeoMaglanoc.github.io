# Block Temple

Build a mobile/web-friendly Godot exploration game combining:

1. A hand-authored monumental sci-fi temple/city environment made in Blender.
2. The existing mining/block-placement system from `projects/block-world`.
3. Exploration-based level design where mining and building unlock alternate routes and secret spaces.

The visual inspiration is the monumental interior/city atmosphere and navigable arena structure of the classic Coruscant/Jedi Temple setting, but this must be an original environment for the public website. Do not copy or redistribute Battlefront/Star Wars meshes, textures, audio, logos, characters, names, or extracted assets. Do not attempt a polygon-for-polygon copy. Create an original “galactic temple / megacity” interpretation.

The MVP is deliberately small:

- one Grand Hall,
- two side rooms/wings,
- one upper balcony,
- one short lower/maintenance area,
- one mineable secret tunnel,
- one exterior vista,
- one final elevated/secret destination.

Do **not** build an entire city.

## 1. First inspect and preserve the existing implementation

Start from:

`projects/block-world/`

Read at minimum:

- `godot/scripts/world.gd`
- `godot/scripts/game.gd`
- `godot/web_shell.html`
- `godot/export_presets.cfg`
- `scripts/build_web.sh`
- `scripts/validate.sh`
- existing tests

Understand the existing behavior before modifying anything.

Important reusable systems already present include:

- voxel storage,
- 16×16 chunk rebuilding,
- exposed-face mesh generation,
- per-chunk collision generation,
- exact voxel grid/DDA ray traversal,
- block breaking,
- block placement,
- player collision prevention,
- save/load of voxel differences,
- first-person movement,
- mobile touch controls,
- desktop controls,
- Web export,
- validation/build scripts.

Do not rewrite these merely for architectural cleanliness.

Create the new project separately, e.g.

```text
projects/block-temple/
```

Copy/refactor reusable components rather than breaking the published Block World project.

## 2. Target architecture

The runtime should contain two spatial layers.

```text
Godot
│
├── AuthoredEnvironment
│   └── imported Blender GLB
│
├── EditableVoxelWorld
│   └── modified Block World voxel engine
│
├── Player
├── InteractionSystem
├── Environment
└── Web/mobile UI
```

The Blender environment contains visually rich permanent architecture.

The voxel system contains gameplay-editable geometry.

Do not voxelize the entire building.

### Permanent geometry

Examples:

- huge columns,
- floors,
- grand staircases,
- arches,
- ceilings,
- balcony railings,
- decorative walls,
- exterior skyline,
- statues,
- large structural elements.

### Editable geometry

Examples:

- cracked wall sections,
- maintenance barriers,
- rubble,
- underground rock,
- blocked passages,
- deliberately exposed construction material,
- all blocks placed by the player.

The visual language must clearly indicate which surfaces are editable.

## 3. Blender workflow

Use both Blender MCP and Blender Python/CLI, but for different purposes.

### Blender MCP is for

- inspecting the current scene,
- visual iteration,
- evaluating scale,
- adjusting composition,
- testing silhouettes,
- checking camera-height appearance,
- trying geometry variations,
- taking viewport screenshots.

When working through MCP:

1. inspect the scene,
2. make one focused change,
3. inspect dimensions/transforms,
4. take screenshots from useful player viewpoints,
5. evaluate,
6. repeat.

Avoid huge uncontrolled “make the whole level” MCP prompts.

### Blender Python/CLI is for

- repeatable generation,
- asset utilities,
- validation,
- naming,
- cleanup,
- export,
- render checks.

The environment must still be reproducible without relying exclusively on an opaque sequence of MCP edits.

Create something like:

```text
projects/block-temple/
├── blender/
│   ├── block_temple.blend
│   ├── scripts/
│   │   ├── build_modules.py
│   │   ├── validate_scene.py
│   │   ├── export_glb.py
│   │   └── render_checks.py
│   └── references/
├── godot/
├── scripts/
├── tests/
└── README.md
```

A typical automated command should eventually resemble:

```bash
blender blender/block_temple.blend \
  --background \
  --python blender/scripts/validate_scene.py
```

and:

```bash
blender blender/block_temple.blend \
  --background \
  --python blender/scripts/export_glb.py
```

Use GLB as the Blender→Godot interchange artifact.

## 4. Make a modular architectural kit before detailing the level

Before constructing the whole environment, make reusable original components:

- large temple column,
- narrow column,
- arch,
- doorway,
- wall panel,
- floor tile module,
- stair module,
- balcony railing,
- ceiling beam,
- window module,
- light strip,
- decorative wall inset,
- exterior tower,
- background building.

Use repeated instances wherever possible instead of unique geometry.

Keep geometry relatively simple.

Most of the perceived quality should come from:

- strong proportions,
- scale,
- composition,
- good roughness/material contrast,
- emissive accents,
- atmospheric lighting,
- fog,
- skyline silhouettes.

Not extreme polygon density.

## 5. Phase 1 — greybox the entire playable loop

Before detailed modeling, construct the complete gameplay route from primitive geometry.

Suggested topology:

```text
                  SECRET OVERLOOK
                         ▲
                         │
                  upper balcony
                    ▲         ▲
                    │         │
            normal stairs   player-built route
                    │         │
SIDE ROOM ─────── GRAND HALL ─────── SIDE ROOM
                    │
                    │ cracked barrier
                    ▼
              mineable tunnel
                    │
             maintenance level
                    │
                 resource
```

The level should support one intended discovery:

The player sees an interesting location that cannot immediately be reached.

They explore.

They discover an editable section.

They mine blocks.

They use those blocks to construct a route.

They reach the previously inaccessible location.

That is the MVP game loop.

At greybox stage, this complete loop must already work.

## 6. Establish scale

Use realistic player scale.

Treat approximately:

```text
player height ≈ 1.75 m
eye height ≈ 1.58 m
```

as the existing game's baseline unless testing reveals a reason to modify it.

The Grand Hall should feel dramatically oversized compared with the player.

However, avoid making traversals unnecessarily long.

Design for a compact 5–10 minute first exploration rather than realistic architectural dimensions everywhere.

Use Blender cameras positioned at expected Godot eye height for visual checks.

Render/check at least:

- entrance view,
- center of Grand Hall,
- side-room view,
- upper-balcony view,
- maintenance tunnel,
- exterior vista.

## 7. Blender scene conventions

Use explicit naming.

Example:

```text
ENV_Hall_Floor
ENV_Hall_Column_A_001
ENV_Stairs_Main
ENV_Balcony
ENV_Wall_East

EDITABLE_Entry_01
EDITABLE_Tunnel_01

COL_Hall
COL_Stairs

SPAWN_Player
MARKER_Secret
```

Do not depend on Blender object names generated as `Cube.014` etc.

Use consistent transforms and apply scale where appropriate before export.

Create collections such as:

```text
ENVIRONMENT
EDITABLE_MARKERS
COLLISION
LIGHTS
BACKGROUND
DEBUG
```

## 8. Materials

Do not create dozens of unique materials.

Start with approximately:

- temple stone,
- darker structural stone,
- polished floor,
- dark metal,
- warm emissive light,
- cool emissive light,
- glass/window,
- background-city material.

Editable voxel materials should look compatible with the authored environment but remain visibly grid-based.

For example:

```text
Temple Stone block
Dark Structure block
Metal block
Light block
Glass block
Tech block
```

Reuse/adapt the existing voxel atlas mechanism rather than introducing a complex material system during MVP.

## 9. Exterior city illusion

Do not model a complete city.

Outside major windows/openings, create:

- several low-detail skyscraper silhouettes,
- a few nearer tower meshes,
- repeated distant buildings,
- emissive window patterns,
- haze/fog,
- perhaps a simple sky gradient.

The goal is parallax and scale, not physical city simulation.

Do not make the background traversable in MVP.

## 10. Godot authored-environment integration

Import the Blender output as:

```text
godot/assets/block_temple.glb
```

Create a wrapper scene if useful:

```text
godot/scenes/block_temple_environment.tscn
```

The imported architecture should have static collision.

Do not regenerate its geometry at runtime.

The existing voxel world remains separately generated/runtime-editable.

## 11. Refactor the voxel system

The current `VoxelIsland` implementation assumes a 96×96×32 island.

Create a reusable version appropriate to this level.

Possible direction:

```text
VoxelWorld
├── bounds
├── blocks
├── chunks
├── edit()
├── rebuild()
├── ray()
└── save_changes()
```

Do not generate terrain/noise for this project.

Instead initialize the voxel volume from explicit authored regions.

Example:

```gdscript
create_box(Vector3i(...), Vector3i(...), BLOCK_TEMPLE_STONE)
create_tunnel_fill(...)
create_rubble(...)
```

Or load editable-region definitions from a compact data file.

The important requirement is that only intentionally designed regions contain editable voxels.

## 12. Hybrid interaction system

The current Block World ray interaction checks voxels.

The new environment contains both voxels and static Blender geometry.

Implement a hybrid target query.

Each frame/action:

```text
camera ray
│
├── voxel DDA
│     └── voxel_hit
│
└── Godot physics ray
      └── authored_mesh_hit
```

Compare hit distances.

The closest valid hit controls interaction.

### Breaking

Only editable voxels can be broken.

Trying to break authored architecture should give subtle feedback and do nothing.

### Placing

Blocks may be placed:

- adjacent to editable voxels,
- on specifically allowed authored surfaces,
- where they do not intersect the player,
- where they do not violate project bounds.

Do not permit the player to place arbitrary blocks outside the intended level.

Create an editable/buildable mask or region test.

Possible representation:

```gdscript
func can_place_block(p: Vector3i) -> bool
```

This can initially use a small set of AABBs.

Do not overengineer.

## 13. One intentional puzzle

Create one clear MVP challenge.

Example:

The player enters the Grand Hall and can see a glowing balcony/overlook.

The normal staircase is broken or blocked.

A side chamber contains mineable temple blocks.

The player mines enough blocks.

The player returns and constructs either:

- a staircase,
- a pillar staircase,
- or a small bridge.

They reach the overlook.

At the overlook place a clear reward:

- unique glowing block,
- panoramic city vista,
- small robot,
- secret room,
- playful message.

Do not require a prescribed exact construction.

Allow emergent Minecraft-style solutions.

## 14. Secret tunnel

Add one explicitly mineable wall or rubble pile.

Breaking through it reveals a small maintenance/undercity passage.

This should demonstrate the second benefit of voxel interaction:

**destructive exploration**, not only construction.

Make the transition visually satisfying:

```text
beautiful authored hallway
        ↓
cracked/blocky wall
        ↓
editable blocks
        ↓
hidden tunnel
```

The player should understand that the blocky material signals interactivity.

## 15. Player and controls

Reuse the current first-person controller unless there is a concrete problem.

Preserve:

Desktop:

- WASD
- mouse look
- Space jump
- left click break
- right click place
- number/wheel block selection

Mobile:

- left movement joystick,
- drag right side to look,
- jump,
- break,
- place,
- block palette,
- fullscreen/orientation handling.

Do not build a new input framework.

Remove Block World's robot-wave functionality if irrelevant.

## 16. Persistence

Reuse the existing “base world + deviations” save concept.

Persist at minimum:

- changed voxel cells,
- player position,
- selected block,
- camera yaw/pitch.

Version the save separately from Block World.

Do not allow this project to read/write Block World's storage key.

If loading an invalid/stale save, recover to the default spawn safely.

## 17. Web performance constraints

The website build is the primary target.

Optimize for phone first.

During MVP:

- no GI requirement,
- avoid expensive dynamic shadows,
- keep light count small,
- instance repeated architecture,
- use simple materials,
- keep transparent geometry limited,
- keep distant city meshes cheap,
- use fog to limit useful visibility,
- use chunked voxel rebuilding as in Block World,
- do not update static architecture.

Add diagnostics similar to Block World:

```text
FPS
draw calls
triangle/primitives count
voxel chunks
dirty chunks
player position
voxel edits
```

Add an optional `?debug=1` view if convenient.

Set performance budgets based on measurements rather than guesses.

At minimum test:

1. desktop browser,
2. narrow/mobile viewport,
3. touch input emulation,
4. lowest intended graphics-quality setting.

Do not add visual features that break the existing web compatibility strategy just to improve screenshots.

## 18. Automated asset validation

Create `blender/scripts/validate_scene.py`.

It should fail on obvious asset-pipeline problems.

Check at least:

- required collections exist,
- required spawn/marker objects exist,
- no absurdly large object bounds,
- no unexpected cameras,
- no obvious duplicate accidental geometry if cheaply detectable,
- object naming follows conventions,
- exportable meshes have sane transforms,
- GLB export succeeds.

Print useful stats:

```text
objects
meshes
vertices
triangles
materials
textures
scene bounds
```

## 19. Automated render checks

Create a Blender script that renders several low-cost inspection images from fixed cameras.

Example output:

```text
build/checks/entrance.png
build/checks/grand_hall.png
build/checks/balcony.png
build/checks/tunnel.png
build/checks/exterior.png
```

Use these images during agent iteration.

The agent must inspect the images rather than assuming geometry looks correct from numeric output alone.

## 20. Godot tests

Port existing relevant mechanics tests.

Add tests for:

### Voxel behavior

- breaking editable block works,
- authored architecture cannot be broken,
- placement modifies correct voxel,
- boundary chunks rebuild,
- placement cannot intersect player,
- saved changes reproduce edited world.

### Hybrid raycasting

Test cases where:

- voxel is closer than mesh,
- mesh is closer than voxel,
- ray hits only mesh,
- ray hits only voxel,
- ray hits nothing.

### Level progression

Where practical, validate that:

- player spawn is collision-free,
- intended mineable wall exists,
- secret tunnel is not initially accessible through an accidental gap,
- required destination marker exists.

Do not attempt fully automated gameplay solving in MVP.

## 21. Build pipeline

Make one top-level command or script eventually perform:

```text
Blender validation
      ↓
GLB export
      ↓
Godot import
      ↓
Godot tests
      ↓
Godot Web export
      ↓
browser tests
```

For example:

```bash
./scripts/build_all.sh
```

Fail loudly on Blender errors, Godot parse/script errors or failed tests.

Reuse the current Block World pattern of explicitly grepping Godot logs for errors rather than trusting only the process exit status.

## 22. Development phases

### Phase A — fork and integration skeleton

Deliver:

- new `projects/block-temple`,
- existing first-person controller works,
- existing break/place system works,
- empty imported GLB loads,
- Web export works.

Acceptance:

The user can open the new project in-browser and place/break blocks.

### Phase B — Blender greybox

Deliver:

- Grand Hall,
- two side rooms,
- balcony,
- stairs,
- secret tunnel,
- external vista opening.

All primitive geometry.

Acceptance:

Entire level can be walked through and scale feels reasonable.

### Phase C — hybrid geometry

Deliver:

- permanent Blender architecture,
- localized editable voxel regions,
- hybrid mesh/voxel interaction.

Acceptance:

Player cannot destroy a permanent column but can mine the designed cracked wall immediately beside it.

### Phase D — gameplay loop

Deliver:

- inaccessible overlook,
- mineable resource area,
- construction solution,
- secret mining route,
- end/reward destination.

Acceptance:

Fresh player can understand and finish the intended 5–10 minute exploration without debug controls.

### Phase E — art pass

Replace greybox pieces with modular original sci-fi architecture.

Focus on:

1. silhouette,
2. scale,
3. material contrast,
4. lighting,
5. atmosphere,
6. detail.

Do not reverse this priority.

### Phase F — mobile/performance pass

Profile and simplify.

Acceptance:

No major input failures, obvious geometry/collision failures, or catastrophic frame drops on the intended web/mobile configuration.

## 23. Blender MCP iteration strategy

For each major area:

### Grand Hall

Ask MCP/agent to:

1. inspect current hall,
2. take eye-level screenshot,
3. evaluate player-scale readability,
4. modify only hall proportions/details,
5. take another screenshot.

Do not simultaneously redesign the entire level.

Repeat separately for:

- entrance,
- balcony,
- side chambers,
- tunnel,
- exterior vista.

Whenever an MCP-generated adjustment should be preserved procedurally, encode it into the Blender source/script rather than leaving the only record in agent conversation history.

## 24. Art direction

Target:

- monumental,
- clean,
- intimidating scale,
- ancient-futuristic,
- warm interior lighting,
- cool distant city,
- large geometric masses,
- sparse ornamentation,
- stylized enough for Web performance.

Avoid trying to reproduce photorealistic film assets.

The player should immediately think:

> giant ceremonial sci-fi city / temple

without requiring copyrighted logos or recognizable exact assets.

## 25. Scope guardrails

Do not add during MVP:

- combat,
- blasters,
- lightsabers,
- NPC combat AI,
- multiplayer,
- procedural city generation,
- vehicles,
- quests,
- inventory crafting,
- physics destruction,
- arbitrary mesh destruction,
- enemies,
- large open world,
- all of Coruscant.

If one of these becomes necessary to make the core loop enjoyable, document why before implementing it.

## 26. Definition of done

The MVP is complete when:

1. It loads from the website as a Godot Web game.
2. Desktop controls work.
3. Mobile controls work.
4. Player can explore a visually coherent original monumental sci-fi temple.
5. Blender-authored geometry and voxel geometry coexist correctly.
6. Permanent architecture cannot be mined.
7. Designed editable areas can be mined.
8. Blocks can be placed against permitted surfaces.
9. The player can construct a route to an otherwise inaccessible location.
10. The player can mine through at least one wall into a hidden area.
11. Changes persist on reload.
12. Reset restores the authored starting state.
13. No obvious collision holes or soft locks exist along the main route.
14. Automated tests pass.
15. Blender validation passes.
16. Web export passes.
17. Fixed Blender inspection renders show no obvious broken geometry.
18. The project does not use copied Star Wars/Battlefront assets.

## 27. Work order

Execute in this exact priority:

```text
existing Block World understanding
        ↓
new project + web build
        ↓
hybrid voxel/static architecture prototype
        ↓
complete greybox gameplay loop
        ↓
playtest
        ↓
Blender modular art kit
        ↓
art pass
        ↓
lighting/atmosphere
        ↓
mobile optimization
        ↓
polish
```

Do not spend significant time detailing Blender assets before the hybrid mine/build interaction works in the browser.

The first milestone I want to see is not a beautiful screenshot.

It is:

> A grey sci-fi hall imported from Blender, running in Godot Web, where I can walk up to an intentionally voxelized section of wall, mine through it, collect/use blocks, build a staircase, and reach an upper platform while the Blender architecture remains intact.