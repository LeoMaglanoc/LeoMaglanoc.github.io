# Validation — Coruscant Temple

Validated locally on 4 October 2026. The playable export is in
`assets/interactive/block-temple/`; authoring and tests are in this project.

## Automated checks

- Blender 5.2.2 LTS: naming, metric bounds, collision objects, required room
  meshes, cameras and GLB export passed. The final scene contains 134 objects,
  113 meshes and 12 materials; geometry includes 140,232 triangles including
  collision meshes. All 98 exported visual meshes contain baked vertex colors.
- Seven fixed Blender inspection views were reviewed: entrance, hall, council,
  hallway, archive, overlook and exterior. The final overlook camera was
  re-rendered after changing its direction toward the city window.
- Godot 4.7.2: clean import and Web export. **153 mechanics checks passed**,
  covering voxel bounds/deltas, DDA, static/voxel nearest hit, real architecture
  collision, mining inventory, placement overlap, movement/jump, authored stairs,
  room-floor support, save recovery and reset.
- The construction fixture passes each stair cell through production placement
  checks. The actual capsule controller jumps six successive one-metre levels
  and walks onto the overlook; completion is detected. This is a native
  controller test, not a claimed manual Chrome construction playthrough.
- **24 web-shell checks passed** using the production script in a DOM fixture:
  simultaneous independent movement/look pointers, third-pointer jump, action
  release/cancel, blur, map, save-key isolation and actual canvas resolution.

Build evidence is under `artifacts/`: asset/import/export/mechanics logs and
`renders/`. Rebuild using `scripts/build_all.sh`.

## Chrome computer-use checks

Used the connected Chrome browser and visible controls at
`http://127.0.0.1:8099/assets/interactive/block-temple/index.html?debug=1`.
No game-state injection or debug teleport was used.

1. Loaded and entered the grand hall. Walked south through the portal into the
   transverse hallway, turned east and reached the mineable service entrance.
2. Broke its upper and lower blocks through the visible Break control. Inventory
   increased from zero to two. Walked through the hole into the service annex;
   its discovery and objective appeared.
3. Aimed at the annex floor and placed a recovered limestone block through Place.
   Inventory dropped to one; three deltas were recorded. This was repeated on
   the final baked-shading export. `chrome/final-state.json` records two breaks,
   one placement, three changes, annex discovery and a successful save.
4. Paused and reloaded. Position, camera, inventory, edits and discovery persisted.
   Opened the map and checked its live player marker. Reset through its explicit
   confirmation restored zero changes/stock/discoveries and the hall spawn.
5. Checked landscape layout at **844 × 390**, selected Touch controls and Eco,
   and operated the movement joystick. The final Eco canvas was **464 × 215**;
   moving the joystick advanced the saved player from x104.64 to x106.67.
   Jump and action controls remained visible.
   The production pointer fixture separately verifies simultaneous touch logic.
6. Read browser console warnings/errors on the final build: none were captured.
   Restored the normal viewport and left the playable preview open.

Screenshots are under `artifacts/chrome/`: `hall.jpg`, `service.jpg`, `phone.jpg`.
They are QA artifacts ignored by Git. Blender MCP also opened the final editable
scene and verified its viewport and object list.

## Performance and validation limits

The local browser reports ANGLE / Mesa Intel UHD Graphics 620. Active browser
samples ranged roughly **3–13 FPS** across the hall and service route, with
higher cost while a Blender render ran in parallel. This machine did not meet
smooth-play performance. Architecture is batched by room/material, hidden rooms
are culled, small columns use fewer segments, shading is baked, Desktop canvas
width is capped at 1280 and Eco uses 55% resolution. These optimizations are
implemented; a 30/60 FPS target has **not** been demonstrated on this hardware.

844 × 390 is a desktop Chrome responsive check. Physical phone performance,
real concurrent finger input, phone fullscreen/orientation behaviour and Safari
remain unverified. The automated touch fixture is not a hardware substitute.

The standalone static export was exercised in Chrome. A new Jekyll page/layout
connects it at `/block-temple/`, following the existing game's integration. A
full Jekyll site build was not run because the local Ruby/Bundler toolchain is
unavailable. Nothing was pushed or deployed.

## Reference fidelity

The supplied images, overhead map and Knightfall video informed the room
arrangement, ceremonial axis, columns, inlaid floor, galleries, circular council
and meditation rooms, blue archive shelves and city-facing windows. Fallen
columns are restored upright for the requested intact variant. Dimensions,
obscured details and some connections are inferred. The service annex and
construction-only overlook are additions. Window scenery uses an original
painted opaque skyline; it is not a traversable city. The seven render views
help inspect the source scene but use Cycles lighting; shipped Chrome uses baked
vertex shading. This is an authored reference reconstruction, not a measured
or asset-extracted exact replica.
