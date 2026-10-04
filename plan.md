Yes. I’d give the agent a fairly strict spec so it builds **a polished phone-first Classic-style toy**, instead of disappearing into voxel-engine rabbit holes.

One important implementation choice: use Godot’s official voxel demo as an architectural reference for chunks, procedural meshes, and raycast-based block editing, but **do not copy its renderer/threading setup literally**. The official demo uses Forward+ and threaded chunk generation, while Godot web exports use the Compatibility renderer, and modern Godot recommends the single-threaded web export for broader browser/mobile compatibility. [GitHub](https://github.com/godotengine/godot-demo-projects/blob/master/3d/voxel/README.md)

# Agent plan: phone-first voxel sandbox with robots

## 1. Goal

Build a small self-contained **Minecraft Classic–inspired voxel sandbox** for Leonardo Maglanoc’s personal website.

The experience should immediately communicate:

> walk around → break blocks → place blocks → build whatever you want → encounter cute blocky robots wandering around the world.

Prioritize:

**fun interaction > visual polish > mobile performance > feature count.**

This is not a survival game and not a modern Minecraft clone.

The finished game should run entirely client-side in the browser with no backend.

Use:

```text
Godot 4.x
GDScript
Compatibility renderer
Web export
Landscape-first mobile layout
```

Godot web exports require WebAssembly/WebGL 2.0, and Compatibility is the renderer intended for web. [Godot Engine documentation](https://docs.godotengine.org/en/4.5/tutorials/export/exporting_for_web.html?utm_source=chatgpt.com)

Do **not** require Blender for the MVP. Build the blocks and robots directly from simple Godot geometry.

---

# 2. Website integration

Create this as another self-contained interactive demo following the repository's existing demo convention:

```text
assets/interactive/block-world/
```

Suggested site route:

```text
/block-world/
```

or, if we want the playful name:

```text
/robot-world/
```

Keep all game-specific source, assets, export files, tests, README, and licensing information inside the interactive-demo directory.

The existing website is a static Jekyll site whose interactive demos are browser-side applications, so this should remain a static-client experience rather than introducing a server component. [Current website repository README](https://github.com/LeoMaglanoc/LeoMaglanoc.github.io/blob/main/README.md?utm_source=chatgpt.com)

---

# 3. Scope

## Required MVP

Implement:

- first-person movement
- jumping
- procedural voxel terrain
- trees
- water or ocean boundary
- break blocks
- place blocks
- 8–12 block types
- hotbar
- mobile touch controls
- desktop controls
- 10–15 wandering robots
- simple robot behaviors
- local world saving
- reset-world button
- sound effects if inexpensive
- fullscreen support
- website route
- good loading screen

Do not implement:

- crafting
- inventory management
- health
- hunger
- enemies
- mining progression
- caves
- multiplayer
- procedural infinite terrain
- complex physics objects
- sophisticated robot AI
- LLMs
- RL
- networking
- dynamic global illumination
- realistic shadows

Think **Minecraft Classic**, not Minecraft 2026.

---

# 4. Target experience

When the game opens:

```text
ROBOT WORLD

A tiny voxel sandbox.

[ PLAY ]
```

After tapping Play:

```text
        blue sky

    🌳             🤖

         🤖

             🌳

-------------------------
       voxel terrain
-------------------------

  ◯                  ⛏
 MOVE              PLACE

 [grass][stone][wood][glass][metal]
```

Within **10 seconds**, the player should understand:

1. move around;
2. look around;
3. break something;
4. place something;
5. notice a robot.

No tutorial popup wall.

Use tiny contextual hints initially and fade them away.

---

# 5. World design

Use a **finite world**, not endless generation.

Start approximately with:

```text
world X: 96 blocks
world Z: 96 blocks
world Y: 32 blocks

chunk X: 16
chunk Z: 16
chunk Y: full world height
```

That produces:

```text
6 × 6 = 36 chunks
```

This is intentionally small enough that the entire island feels explorable.

World topology:

```text
       ocean / void boundary

     ~~~~~~~~~~~~~~~~~~~
   ~~                   ~~
  ~~      hills          ~~
 ~~                       ~~
 ~~   forest      hill    ~~
 ~~                       ~~
 ~~        spawn          ~~
 ~~                       ~~
 ~~ robot area   trees    ~~
  ~~                     ~~
   ~~~~~~~~~~~~~~~~~~~~~~~
```

Use deterministic seeded procedural generation.

Basic generation:

```text
height =
    base_height
    + low_frequency_noise
    + small_detail_noise
```

Keep elevation modest.

Something like:

```text
lowest terrain: 4
typical:        7–10
highest:        15–18
```

No huge mountains.

The world should look readable from a phone screen.

---

# 6. Block palette

Keep the palette small and visually distinctive.

Suggested blocks:

```text
1  Grass
2  Dirt
3  Stone
4  Sand
5  Wood
6  Leaves
7  Brick
8  Glass
9  White Lab Block
10 Dark Metal
11 Blue Tech Block
12 Glowing Core
```

The last four make the world subtly personalized rather than being a straight Minecraft imitation.

Possible aesthetic:

```text
natural world
+
small traces of a robotics laboratory
```

For example, world generation can occasionally create:

```text
metal platforms
little antennas
charging pads
robot stations
```

But keep them block-built.

---

# 7. Voxel implementation

Represent blocks as integer IDs.

Conceptually:

```gdscript
enum Block {
    AIR,
    GRASS,
    DIRT,
    STONE,
    SAND,
    WOOD,
    LEAVES,
    BRICK,
    GLASS,
    LAB,
    METAL,
    TECH,
    CORE
}
```

Store chunk data in compact arrays rather than creating one Godot node per block.

Absolutely avoid:

```text
MeshInstance3D per voxel
```

Instead:

```text
VoxelWorld
 ├── Chunk 0,0
 │    ├── MeshInstance3D
 │    └── StaticBody3D
 │
 ├── Chunk 0,1
 ├── Chunk 0,2
 └── ...
```

Generate only visible cube faces:

```text
for each solid block:
    for each of 6 directions:
        if neighbor == AIR:
            emit face
```

Godot's own minimal voxel demo uses chunk data, procedural `SurfaceTool` meshes, and camera raycasts for placing/breaking blocks. [GitHub](https://github.com/godotengine/godot-demo-projects/blob/master/3d/voxel/README.md)

Use either `SurfaceTool` or `ArrayMesh`; Godot supports procedural mesh construction from arrays of vertices, normals, UVs and indices. [Godot Engine documentation](https://docs.godotengine.org/en/latest/tutorials/3d/procedural_geometry/arraymesh.html?utm_source=chatgpt.com)

Do **not** implement greedy meshing initially.

Add it only if profiling demonstrates a need.

---

# 8. Texture strategy

Create one original pixel-art texture atlas.

For example:

```text
256 × 256 atlas

each tile:
16 × 16
or
32 × 32
```

Use:

```text
nearest-neighbor filtering
no mipmapped blurry pixel art if avoidable
simple UV mapping
```

Make all textures original.

Do not use Minecraft textures.

Art direction should evoke early voxel games without copying Mojang assets.

---

# 9. Collision

Prefer **one static collision representation per chunk** rather than one collision shape per voxel.

Conceptually:

```text
visible chunk mesh
       ↓
collision geometry
       ↓
StaticBody3D
```

Regenerate a chunk's mesh/collider only when one of its blocks changes.

Also dirty a neighboring chunk when editing a block on a chunk boundary.

Godot recommends keeping collision-shape counts low, and static concave/trimesh collision is specifically appropriate for level geometry. [Godot Engine documentation](https://docs.godotengine.org/en/4.5/tutorials/physics/collision_shapes_3d.html?utm_source=chatgpt.com)

Do not regenerate the whole world after one block edit.

---

# 10. Player

Use:

```text
CharacterBody3D
 └── Camera3D
      └── interaction ray
```

Abilities:

```text
walk
strafe
jump
gravity
look
break
place
```

No sprint required initially.

Tune movement to feel slightly arcade-like rather than physically realistic.

Suggested starting targets:

```text
walk speed: ~5 blocks/s
jump: ~1.25 blocks high
interaction distance: 5 blocks
```

Tune by feel.

---

# 11. Block interaction

Use a camera raycast.

Godot's voxel demo likewise uses `RayCast3D` to determine which block the player is looking at for placing and breaking. [GitHub](https://github.com/godotengine/godot-demo-projects/blob/master/3d/voxel/README.md)

Breaking:

```text
camera
   ↓ ray
hit voxel
   ↓
remove voxel
   ↓
mark chunk dirty
   ↓
rebuild mesh/collision
```

Placing:

```text
camera
   ↓
hit face
   ↓
neighbor voxel position
   ↓
place selected block
```

Prevent the player from placing a block inside their own collision volume.

---

# 12. PHONE CONTROLS — treat this as a core feature

This is the most important UX requirement.

Design for **landscape phone use first**.

Layout:

```text
┌───────────────────────────────────────┐
│                                       │
│                                       │
│               WORLD                   │
│                                       │
│                  +                    │
│                                       │
│   ◯                           [BREAK]  │
│ MOVE                          [PLACE]  │
│                                       │
│ [1][2][3][4][5][6][7]                 │
└───────────────────────────────────────┘
```

Godot exposes multi-touch press/release and touch-index information through `InputEventScreenTouch`, so separate fingers can be tracked for movement, camera and action input. [Godot Engine documentation](https://docs.godotengine.org/en/latest/classes/class_inputeventscreentouch.html?utm_source=chatgpt.com)

### Left thumb

Virtual joystick:

```text
forward/back
strafe left/right
```

Joystick should appear wherever practical within its defined left-side region rather than requiring pixel-perfect thumb positioning.

### Right thumb

Dragging anywhere over the right-side world view rotates the camera:

```text
horizontal drag → yaw
vertical drag → pitch
```

Clamp pitch.

### Actions

Large buttons:

```text
BREAK
PLACE
JUMP
```

Possible layout:

```text
                     [BREAK]
                [JUMP]     [PLACE]
```

Buttons need generous touch targets.

### Hotbar

Bottom center:

```text
[🌱][🪨][🪵][🧱][▦][⬛][🔷]
```

Show approximately 7 slots at once.

Tap selected block again or expose a small palette button to access remaining blocks.

Do not put twelve microscopic buttons across a phone display.

---

# 13. Desktop controls

Keep conventional controls:

```text
WASD       movement
mouse      camera
space      jump

left click     break
right click    place

1–9            block selection
mouse wheel    cycle blocks

Esc            pause/unlock mouse
```

Desktop should remain good, but phone gets design priority.

---

# 14. ROBOTS

This is the primary modification that gives the world personality.

Populate the world with approximately:

```text
12 robots
```

Do not make them humanoid-realistic.

Make them **cute block robots that belong naturally in the voxel world**.

Example:

```text
       ┌───────┐
       │ ●   ● │
       │   ▄   │
       └───┬───┘
         ┌─┴─┐
      ───│   │───
         └─┬─┘
          / \
```

Build them from reusable low-poly/cube components directly in Godot:

```text
Robot
 ├── CharacterBody3D
 ├── CollisionShape3D
 └── Visual
      ├── Body
      ├── Head
      ├── EyeLeft
      ├── EyeRight
      ├── ArmLeft
      ├── ArmRight
      ├── LegLeft
      └── LegRight
```

No Blender dependency.

---

# 15. Robot varieties

Use three cosmetic archetypes.

### Explorer bot

Small.

```text
white + blue
antenna
quick movement
```

### Builder bot

Chunkier.

```text
yellow/orange accents
large arms
slower movement
```

### Research bot

Tall/slim.

```text
white + dark metal
glowing face
```

All can share the same basic behavior implementation.

Variation should mainly come from:

```text
scale
materials
head geometry
antenna
movement speed
```

not separate AI systems.

---

# 16. Robot behavior

Do not build navmesh-heavy AI.

The voxel grid itself gives us a cheap navigation representation.

Implement a small state machine:

```text
         ┌────────┐
         │  IDLE  │
         └───┬────┘
             ↓
       ┌───────────┐
       │  WANDER   │
       └──┬─────┬──┘
          │     │
 sees     │     │ blocked
 player   │     │
          ↓     ↓
 ┌────────────┐ ┌─────────┐
 │LOOK_PLAYER │ │ REPLAN  │
 └─────┬──────┘ └────┬────┘
       │              │
       └──────┬───────┘
              ↓
            IDLE
```

Each robot periodically picks a reachable nearby target.

Something like:

```text
target radius:
5–15 blocks
```

Movement can be grid-aware rather than using full navigation meshes.

At minimum robots need to:

- wander
- avoid obvious holes
- walk on terrain
- turn toward movement
- idle occasionally
- notice the player
- look at the player
- recover if stuck
- respawn if they fall out of the world

---

# 17. Robot animation

Keep it extremely cheap.

During walking:

```text
left arm  ↔ right leg
right arm ↔ left leg
```

Sinusoidal procedural animation is enough:

```text
angle = sin(time * walk_frequency) * amplitude
```

Add:

```text
head bob
occasional head turn
tiny idle bounce
```

This should make them feel much more alive without skeletal animation.

---

# 18. Robot/player interaction

When the player approaches a robot, show a tiny label.

Examples:

```text
EXPLORER-07

BUILDER-02

UNIT-12
```

Looking directly at it could produce:

```text
[ 👋 ]
```

Tap/interact and robot briefly:

```text
looks at player
waves
beeps
```

That's enough for v1.

Do not add dialogue systems.

---

# 19. Robot world behaviors

To make the robots feel embedded rather than randomly spawned, create several little destinations:

```text
charging station
robot workshop
observation tower
small lab
antenna
metal platform
```

All should themselves be built from normal voxel blocks.

Robots occasionally walk between these.

This produces the illusion:

> these little dudes actually live here.

without implementing complicated simulation.

---

# 20. Important emergent interaction

Robots must react sensibly when the player modifies terrain.

Example:

```text
robot walking
      ↓
player destroys block ahead
      ↓
robot detects missing support
      ↓
stop
      ↓
choose another direction
```

We do not need sophisticated pathfinding.

Just don't allow them to mindlessly walk into every hole.

And if the player completely traps a robot in blocks...

that's funny.

Let it happen.

---

# 21. Personalized touches

Keep personalization playful rather than turning this into a CV.

Possible robot names:

```text
ACT
DREAMER
VLA
MUJOCO
SLAM
PIXEL
NOVA
SO101
```

I would **not** label everything with robotics terminology.

Maybe only a few Easter eggs.

Example:

A rare blue block has:

```text
FOUNDATION CORE
```

Or a little laboratory sign:

```text
PHYSICAL AI LAB
```

Most players should simply interpret it as a cute robot world.

---

# 22. World spawn

Make spawn handcrafted even if the surrounding terrain is procedural.

Something like:

```text
                  hill
                   🌳

        🤖

                 🤖
       ┌───────────────┐
       │ ROBOT LAB     │
       │               │
       └───────────────┘

     🤖           🤖

           PLAYER
             ↓
```

Immediately visible:

- grass
- trees
- robots
- a little laboratory
- distant terrain

The player should not spawn staring at a dirt wall.

---

# 23. Save system

Persist:

```text
seed
modified blocks
player position
selected block
```

Prefer saving only deviations from the generated world:

```text
world_seed
changes = {
    position → new_block_type
}
```

rather than serializing the complete voxel world.

Use browser-compatible local persistence.

Add:

```text
RESET WORLD
```

with confirmation.

---

# 24. Rendering constraints

Optimize aggressively for web/mobile.

Use:

```text
Compatibility renderer
simple unlit or lightweight materials
texture atlas
nearest filtering
minimal transparency
minimal lights
no realtime shadow requirement
no postprocessing requirement
no SSAO
no volumetrics
no GI
```

Godot specifically identifies Compatibility as its web renderer and as appropriate for low-end/mobile hardware. [Godot Engine documentation](https://docs.godotengine.org/en/latest/tutorials/rendering/renderers.html?utm_source=chatgpt.com)

Use simple fog to hide the finite horizon and reduce required view distance.

Something like:

```text
visible radius:
~3–4 chunks
```

Then tune based on real phone profiling.

---

# 25. Web-specific requirement

Use the normal **single-threaded Godot Web export first**.

Godot has supported single-threaded web export since 4.3 and recommends it as the default/preferred web path because it avoids the `SharedArrayBuffer`/cross-origin-isolation requirements of threaded exports and improves compatibility, including on Apple devices. [Godot Engine documentation](https://docs.godotengine.org/en/4.5/tutorials/export/exporting_for_web.html?utm_source=chatgpt.com)

Therefore:

**do not build the voxel architecture around background Godot threads.**

Instead generate the initial chunks incrementally:

```text
frame 1 → chunk
frame 2 → chunk
frame 3 → chunk
...
```

or generate a small batch per frame.

Show:

```text
GENERATING WORLD...
████████░░
```

until the required spawn region exists.

---

# 26. Performance targets

Treat these as engineering targets, not guarantees.

Aim for:

```text
60 FPS        recent phones
>= 30 FPS     weaker supported phones

12 robots
~36 total chunks
3–4 chunk visible radius

minimal frame spikes while:
breaking blocks
placing blocks
robots navigating
saving
```

Add a simple debug overlay toggled by a development flag:

```text
FPS
draw calls
visible chunks
visible triangles
robots active
dirty chunks
```

Profile on an actual phone, not just desktop Chrome.

Godot's documentation explicitly warns that web exports have tighter CPU/GPU constraints on mobile than native exports. [Godot Engine documentation](https://docs.godotengine.org/de/4.x/tutorials/export/exporting_for_web.html?utm_source=chatgpt.com)

---

# 27. Suggested source structure

```text
assets/interactive/block-world/

├── project.godot
├── export_presets.cfg
├── README.md
├── LICENSES.md
│
├── scenes/
│   ├── main.tscn
│   ├── world.tscn
│   ├── player.tscn
│   ├── robot.tscn
│   └── ui.tscn
│
├── scripts/
│   ├── world/
│   │   ├── voxel_world.gd
│   │   ├── chunk.gd
│   │   ├── chunk_mesher.gd
│   │   ├── terrain_generator.gd
│   │   └── block_database.gd
│   │
│   ├── player/
│   │   ├── player.gd
│   │   └── block_interaction.gd
│   │
│   ├── robot/
│   │   ├── robot.gd
│   │   ├── robot_brain.gd
│   │   └── robot_animation.gd
│   │
│   ├── ui/
│   │   ├── touch_controls.gd
│   │   ├── hotbar.gd
│   │   └── pause_menu.gd
│   │
│   └── save/
│       └── world_save.gd
│
├── textures/
│   └── blocks.png
│
├── audio/
│
├── tests/
│
└── web/
    └── exported build
```

---

# 28. Implementation order

Have the agent work vertically rather than building every subsystem before anything is playable.

### Milestone 1 — one editable chunk

Deliver:

```text
flat blocks
first-person movement
camera
break
place
desktop controls
```

No robots.

No procedural generation.

The game must already feel responsive.

### Milestone 2 — voxel world

Add:

```text
chunking
terrain generation
trees
texture atlas
multiple block types
finite island
fog
chunk collision
```

Verify block editing across chunk boundaries.

### Milestone 3 — phone controls

Before adding content, make phone interaction good:

```text
virtual movement stick
touch camera
jump
break
place
hotbar
fullscreen
orientation handling
```

Test on real Android Chrome and, if available, Safari/iOS.

### Milestone 4 — robots

Add one robot first.

Get:

```text
wander
terrain following
idle
look at player
procedural walking animation
stuck recovery
```

Then spawn 10–15.

### Milestone 5 — robot world

Add:

```text
little lab
charging station
robot destinations
robot variants
names
wave interaction
```

### Milestone 6 — persistence

Add:

```text
seed
modified block save
player position
reset world
```

### Milestone 7 — polish

Then:

```text
sounds
particles on block break
placement animation
loading screen
better sky
UI polish
robot beeps
spawn composition
```

### Milestone 8 — website integration

Export:

```text
Godot → Web
```

Place static build inside the site's interactive assets and expose it through a fullscreen website route consistent with the existing demos.

---

# 29. Tests / acceptance criteria

Do not consider the task complete because it “runs on desktop.”

### Gameplay

- Player can move and jump.
- Player cannot walk through terrain.
- Player can break blocks.
- Player can place blocks.
- Blocks at chunk boundaries work.
- Hotbar works.
- Player cannot place blocks inside themselves.
- Player can build arbitrary structures.

### Robots

- At least 10 robots inhabit the world.
- Robots visibly move around.
- Robots stop rather than deliberately stepping into obvious holes.
- Robots respond when their path is blocked.
- Robots occasionally idle.
- Robots look toward nearby player.
- Robots animate while walking.
- Robots can recover from stuck states.
- Falling robots respawn safely.
- Player-created terrain does not crash robot logic.

### Mobile

On phone:

- movement and camera can operate simultaneously;
- camera movement does not steal joystick touches;
- jump works while moving;
- break/place works while moving;
- buttons don't accidentally rotate the camera;
- hotbar is comfortably tappable;
- game fills available viewport;
- browser scrolling is suppressed while interacting;
- UI respects safe-area margins;
- orientation changes do not break layout.

### Web

- works as static files;
- no backend;
- no remote runtime dependency unless already approved;
- loads from the website route;
- refresh works;
- reset works;
- console contains no persistent errors.

---

# 30. Scope-control rule for the agent

This is important:

> **Do not add features outside this specification until the core phone experience is polished.**

Specifically, do not spontaneously add:

```text
crafting
enemies
day/night
infinite terrain
LLM robots
complex pathfinding
physics destruction
multiplayer
procedural buildings
Blender pipeline
quests
survival mechanics
```

If time remains, improve:

```text
touch feel
camera feel
world composition
robot charm
block feedback
performance
```

instead.

---

# Definition of done

I would give the agent this exact final target:

> **A visitor opens `/block-world/` on their phone, taps Play, and within seconds is walking around a charming voxel island inhabited by little robots. They can break and place blocks fluidly using touch controls, build structures, interfere with the robots' environment, explore a small robot lab, leave the page, return later, and find their edits preserved. The game should feel like a tiny original Minecraft Classic–style toy rather than a technical voxel-engine demo.**

And I think that's the right MVP. **The robots should be the personalization**, rather than piling your CV/research references everywhere. A block world where little robots are just casually living their lives is both more charming and more “you.” 

I can also create a concept image of the phone UI and voxel robot world for the agent to use as a visual target.