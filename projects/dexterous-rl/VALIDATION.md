# Validation — 2026-10-07

## Reproducibility and native teacher

Docker-built CPU evaluator, MuJoCo 3.11.0 and ONNX Runtime 1.23.0. Original
Wuji v2026.9.27 Hand 1 actor and matching MJCF/assets. The shared browser
ONNX runtime is 1.23.2 WASM, single thread. Full dependency lock and Docker
image ID are retained. Integrity check verifies checkpoint hashes, embedded
policy identity, input/output dimensions, unchanged meshes, and physical timestep.

- 12 native uniformly sampled quaternion goals, seed 42, 14 simulated seconds
  per goal, official observation history and action filtering.
- Native outcomes: all goals reach low minimum error; no final dropped state.
  See `results/native-evaluation.json` for per-trial values, including final
  error (which can fluctuate after first reaching the goal).
- `results/native-visual.png` and `results/native-collision.png` inspect original
  visual meshes separately from the collision representation.
- Parent scene solver defaults are preserved. Upstream's attach warning that
  robot-subspec iterations differ from parent defaults is retained in
  `results/native-mujoco-warnings.txt`, not silently overridden.

## Browser numerical and behavior regression

Chrome computer-agent run of `tests/dexterous-rl/index.html` against the Docker
preview. Raw report: `results/browser-regression.txt`; structured report:
`results/browser-regression.json`.

| Check                                       |                 Result |
| ------------------------------------------- | ---------------------: |
| Frozen observation/action vectors           |              10 passed |
| Maximum observation error                   |                      0 |
| Maximum action error                        |   2.980232238769531e-7 |
| Maximum filtered target error               |                      0 |
| Maximum qpos error after five physics steps |  3.0307036380516905e-7 |
| Browser engine                              |          MuJoCo 3.11.0 |
| Fixed-goal browser trials                   | 12/12 reached and held |
| Dropped cubes in fixed-goal trials          |                      0 |
| Mean actor inference in batch               |               0.255 ms |
| Mean five-step physics cost in batch        |               0.863 ms |

Success uses error below 0.2 rad for five consecutive policy steps. Each fixed-goal
trial lasts 14 simulated seconds. Minimum error ranges from approximately 0.42°
to 3.75°; maximum final error is 8.72°. Minimum observed cube z exceeds 0.523 m,
well above the 0.4099 m drop threshold. These 12 cases are regression coverage,
not a general reliability guarantee.

A separate 44-second continuous trial changes the goal at 14 s, changes it again
at 15 s while error is still about 29°, and applies a real velocity impulse at
30 s, with **no resets**. It remains above z=0.523 m, converges on the new target,
and finishes at about 2.51° error. The impulse uses delta linear velocity
[0.03,0.02,-0.02] m/s and angular velocity [1,0.3,-0.5] rad/s. This validates a
bounded perturbation, not arbitrary force recovery.

One-step parity is the numerical regression; long contact trajectories may
diverge slightly with floating-point inference while still satisfying the
behavior test. The initial cross-version attempt (3.3.7 native / 3.12 browser)
was rejected; final artifacts are regenerated using matched 3.11 engines.

## Chrome layout and interactions

Used the Chrome computer agent, not a headless screenshot substitute.

| Viewport                  | Inspection                                                                                                                            |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Desktop 1440 × 900        | Hand, target, error and buttons fit; orbit, keyboard goal rotation and controls exercised                                             |
| Phone portrait 390 × 844  | Hand and complete primary controls visible; target drag changes goal; no horizontal overflow                                          |
| Phone landscape 844 × 390 | Side-by-side simulation and controls; all primary buttons at least 44 px high; target drag and push exercised; no horizontal overflow |

Saved `results/chrome-desktop.jpg`, `chrome-portrait.jpg`, and
`chrome-landscape.jpg`. Also exercised repeated Random Target while operating,
Pause/Resume and Reset. The compiled Jekyll fullscreen route is checked in Chrome
as well as the direct static runtime. Startup parity checks pass in the compiled
route using the deployed shared ONNX WASM path.

**Limits:** these are Chrome viewport tests on this computer, not a physical
phone or mobile CPU benchmark. The compositor was throttled to roughly 1 fps
in this agent session despite low measured rendering submission cost. Thus no
30/60 fps or device thermal/memory claim is made. Actual touch hardware, pinch
zoom, sustained mobile frame rate and memory need a physical phone follow-up.
The implementation uses pointer events, pointer capture and touch-action rules;
the agent exercised pointer dragging, not hardware touch. Batch compute timings
above do not measure phone performance or GPU completion time.

## Publication

Production Jekyll build runs in Docker. The project-assets publisher checks
byte-identical source and deployed runtime files. The route checker includes
`/dexterous-rl/`, shared dependencies, manifest files and the 1,000,000,000-byte
budget. Final local production output: **999,295,349 bytes**, with all 22 public
project routes, 90 HTML dependencies, and 547 manifest runtime files checked. TinyEgoVLA's 12.8 MB exhibit assets are excluded from production to meet
that limit; its archive URL, source, media, records and local model continuation
archive are preserved. Its original export test still runs in CI and passes.

See `results/jekyll-build.log`, `results/published-links.txt`, and
`results/tiny-ego-archive-check.txt`. Upstream credits and license texts are
visible in the demo and retained with the deployment.

The public GitHub Pages deployment was verified in Chrome on 2026-10-07 after
[deployment run 37670911579](https://github.com/LeoMaglanoc/LeoMaglanoc.github.io/actions/runs/37670911579)
succeeded for commit `158a232`. The existing blog's new demo link opens the
live simulation; startup reports all 10 actor parity checks passed (maximum
error `3.0e-7`), with the policy and physics advancing at 1.00× simulated time.
See `results/chrome-live.jpg` and `results/live-deployment.json`.

The offline upstream archive was checked against all 380 archived source/model
files; all upstream Python sources and original model assets are preserved.
See `results/source-archive-integrity.json` and the recovery instructions in README.

## Shared renderer and fullscreen redesign — 2026-10-08

The hand and physical cube now come from MuJoCo's visualization scene through
`projects/shared/mujoco-three-renderer.js`. The physical cube retains all six
authored texture faces. The target reuses these textures with transparent
materials, rendered in a scissored viewport of the same canvas and WebGL context.
The original model's nonphysical mocap goal geom is excluded by the application.
Source normals, visual geom groups and independent normal/UV indices are retained;
no physical mesh, physics setting, policy, action filtering or observation changed.

Independent Chrome computer-use runs against Docker previews:

- G1: ten native trace comparisons; action error ≤6.56e-7. Standing, walking
  1.04 m under a 0.4 m/s command, reset, pause/resume and pushes pass. Shared
  renderer reports and old/new fixed viewport images are under
  `../shared/validation/`.
- Wuji: ten golden vectors; observation and action-target errors zero;
  actor error 2.98e-7; five-step qpos error 3.03e-7.
- 12/12 fixed-goal trials reach and hold the target, with no drops.
- Continuous goal changes and bounded impulse recovery pass; final orientation
  error 2.51°. Raw results: `results/redesign-2026-10-08/browser-regression.txt`.
- Shared rendering: 28 visual geoms, 27 source-normal mesh geoms, six cube texture
  faces, stable mesh and geometry identities over 120 frames. Wuji scene-update
  median 0.6 ms / p95 1.0 ms on this desktop Chrome run. These are CPU samples,
  not GPU timer measurements or physical Android device performance.
- Authored normals versus generated indexed normals compared in a fixed pose.
  Authored normals preserve CAD edges; screenshots are retained in shared results.
- Desktop 1440×900, phone portrait 390×844, phone landscape 844×390 checked in
  Chrome. Hero text hides on phones; target, reset and pause remain reachable;
  no document overflow. Target pointer drag, arrow-key rotation, random goal,
  background orbit, wheel zoom, perturb, reset and credits dialog exercised.
  Responsive viewport tests do not substitute for physical phone hardware tests.
- Production Jekyll build checked in Docker, including the public iframe route
  and the blog's demo link. The dexterous CSS is excluded from the site's legacy
  minifier, which corrupts custom properties inside `calc()` (same existing
  protection as G1). Diagnostics are hidden by default and enabled by `?debug=1`.

The new viewport screenshots and browser regression report are in
`results/redesign-2026-10-08/`. Existing teacher/checkpoint provenance and licenses
remain intact.
