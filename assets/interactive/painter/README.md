# Panda Drawing & Repair

A browser-native reinterpretation of [Robot Drawing Repair](https://github.com/hiteshhedwig/robot-drawing-repair).
Open `/painter/`, draw on REFERENCE, press **Paint**, erase CURRENT, and press
**Repair now** or enable **Auto repair**. No backend or WebGPU is required.
Everything executes locally; Three.js/OrbitControls are downloaded from jsDelivr.

## Files and architecture

- `robots/panda/`: official Menagerie Panda assets, Apache-2.0 license, and a
  project-owned marker/table/50 × 40 cm canvas scene. Only the marker is added to
  the upstream robot XML. `asset-manifest.json` enumerates every required mesh.
- `src/simulation.js`, `ik.js`, `planner.js`, `executor.js`: reuse the site's
  MuJoCo WASM build, solve complete marker trajectories, and execute position
  targets through the original Panda servos and `mj_step`.
- `src/drawing-input.js`, `stroke-processing.js`, `coordinate-map.js`: capture
  ordered Pointer Event strokes, resample by arc length, and map logical
  640 × 512 coordinates into the central 28 × 24 cm of the board.
- `src/ink-model.js`, `canvas-renderer.js`, `renderer.js`: persistent actual
  world-space marker segments, the robot output raster, and Three.js. CURRENT and
  the board texture share the same ink raster; overlays never enter that raster.
- `src/error-detector.js`, `repair-planner.js`: directional raster perception,
  missing runs, overlap, bridge decisions, and greedy nearest-endpoint ordering.
- `src/main.js`, `ui.js`: explicit state machine, cancellation tokens,
  countdowns, progress checks, live replanning, and controls.
- `index.html`, `painter.css`: responsive desktop/portrait/landscape interface.
- `_pages/painter.md`, `_layouts/painter-fullscreen.html`: fullscreen site route.
  `_data/homepage.yml` adds its Interactive Web Demos link.

## MuJoCo and IK

The physics timestep is 2 ms, bounded to 25 steps per animation frame. Graphics
render at most 30 fps. The renderer reads actual MuJoCo body poses, never animates
robot transforms independently. The gripper is closed after loading the original
home keyframe. Each stroke approaches at 45 mm above the board, lowers to 2 mm
above its surface, draws, and lifts. The final pose holds above the last endpoint.

Seven arm joints use the actual marker site's position, rotation and Jacobian.
IK uses weighted orientation (0.08), damped least squares (5e-4), up to 120
iterations, ±0.08 rad updates, and clamped joint limits. Home supplies the stable
orientation. Contact targets use 0.3 mm precision; hover targets allow 1.5 mm.
The complete path must solve before any motion begins. Planning yields every
12 targets and aborts safely on cancellation or failure.

Joint-space segments use cosine easing, drawing/travel speeds of 1.2/1.8 rad/s,
and 150/250 ms drawing/travel settling. Bias compensation is justified by a
physical tracking test: settled center error was approximately 6.8 mm without
compensation and 0.12 mm with it. Original actuator gains remain unchanged.
Only actual marker motion deposits ink, with a 2 mm sampling threshold and a
final short segment at lift/cancel. Stored world coordinates retain actual tip Z;
the visualization places their raster on the board surface.

## Detection and repair

The detector reads only black ink from CURRENT's offscreen raster. Reference
samples are normally 2 px apart. A local tangent/normal search accepts 8 px of
perpendicular offset, 2 px of tangential offset, and 12 px tangential offset near
true stroke endpoints. Its metric is the percentage of uncovered path samples,
not raster area. Boolean error map, missing flags, sparse red overlay and yellow
repair preview remain separate from ink.

Consecutive missing samples form repair runs with 12 px overlap. A healthy
bridge is drawn through when its estimated cost at 85 px/s is cheaper than air
travel at 135 px/s plus 0.55 s lift/lower overhead. Runs are greedily ordered from
the current marker projection, reversing toward the closer endpoint.

Auto repair starts two seconds after erasing finishes. Erasing during planning
or execution invalidates the old token, holds the robot at its actual pose,
removes underlying segments, and schedules a fresh plan after release. Manual
repair also observes and repeats until no samples are missing. Improvement
below 0.05 percentage points stops explicitly as **Repair stalled**, preserving
the unresolved percentage.

## Browser and mobile adaptations / deviations

- Drawing plans use 8 px spacing; repairs use 2 px spacing. Finer repairs and
  longer settling close sharp corners that otherwise caused a stalled heart tip.
- Input and analysis have deterministic sample budgets. Up to 100 disconnected
  strokes and 10,000 live input points are retained; plans cap at 1,800 targets.
  Pathological scribbles are uniformly simplified instead of blocking the UI.
- Ink raster updates append new segments; erasing rebuilds from remaining world
  segments. Pointer capture, `touch-action: none`, a visible eraser, and a minimum
  18 CSS px finger radius keep interaction usable on narrow screens.
- Portrait stacks the panels with reachable sticky controls. Landscape uses
  three columns. Only the 3D canvas handles orbit gestures. Touch devices disable
  shadows, renderer DPR is capped at 1.5, and detector updates are throttled
  during motion.
- Camera-RGB perception from the reference's later experimental work is not
  used. This follows the requested actual-marker/raster specification.
- Optional image import is deferred. Freehand drawing, physical ink, detection,
  manual/auto repair, preview and live disturbance handling are implemented.

## Validation

Run from the repository root:

```sh
npm test --prefix assets/interactive/painter
# With mujoco and onnxruntime installed in a Python environment:
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s assets/interactive/painter/tests -p 'test_*.py' -v
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s assets/interactive/g1/tests -v
python3 -m http.server 8766 --bind 127.0.0.1
# In another terminal, with Playwright installed:
npm install --prefix /tmp/painter-test playwright
NODE_PATH=/tmp/painter-test/node_modules node assets/interactive/painter/tests/browser.cjs
```

`CHROME_PATH`, `PAINTER_URL`, and `PAINTER_ARTIFACTS` override browser executable,
URL, and output location. The browser suite uses actual mouse/CDP touch gestures
and buttons, then accelerates simulation time through the same physics executor
for regression checks. Production physics remains bounded per frame. Screenshots
and JSON results go to `/tmp/painter-browser` by default.

Coverage includes mapping signs and inverse, disconnected/degenerate strokes,
dense input budgets, directional matching, middle/end gaps, bridge decisions,
repair overlap/reversal, persistent erasing, native and WASM model loading, all
contact/hover corners, joint limits, tracking compensation, physical ink,
pen-up separation, cancellation, heart reproduction, manual repair, auto repair,
live replanning, reset during execution, texture synchronization, and overflow
at 1440 × 900, 360 × 800, and 800 × 360. Existing G1 tests are retained unchanged.

Observed validation: all 11 JavaScript algorithm/WASM tests, the native scene
test, and the four existing G1 contract tests pass. Chrome desktop and both
touch viewports reproduced hearts at approximately 0.9% missing, then reached
0% after manual and automatic repair, including a live disturbance/replan.
No uncaught page errors or horizontal overflow were observed. The Jekyll build
succeeds; the fullscreen iframe route is also checked against built output.

## Limits and remaining work

The full official model requires about 33 MB of mesh assets before transfer
compression, plus the shared WASM runtime. First load and model compilation can
be noticeable on phones. Large drawings take longer to execute; budgeted
scribbles can lose fine detail. Three.js needs WebGL and network access to its
CDN; no offline service worker is provided. Browsers are tested at Android sizes
with touch emulation, rather than on a physical Galaxy S24 FE. There is no global
collision-aware planner. Sharp or very dense shapes may retain residual missing
samples; the explicit stalled state prevents endless repair or false success.

See `THIRD_PARTY_NOTICES.md` for provenance and licenses. No unlicensed reference
implementation source is copied or distributed.
