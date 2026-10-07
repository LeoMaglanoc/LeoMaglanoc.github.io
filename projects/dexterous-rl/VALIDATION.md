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

| Check | Result |
|---|---:|
| Frozen observation/action vectors | 10 passed |
| Maximum observation error | 0 |
| Maximum action error | 2.980232238769531e-7 |
| Maximum filtered target error | 0 |
| Maximum qpos error after five physics steps | 3.0307036380516905e-7 |
| Browser engine | MuJoCo 3.11.0 |
| Fixed-goal browser trials | 12/12 reached and held |
| Dropped cubes in fixed-goal trials | 0 |
| Mean actor inference in batch | 0.255 ms |
| Mean five-step physics cost in batch | 0.863 ms |

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

| Viewport | Inspection |
|---|---|
| Desktop 1440 × 900 | Hand, target, error and buttons fit; orbit, keyboard goal rotation and controls exercised |
| Phone portrait 390 × 844 | Hand and complete primary controls visible; target drag changes goal; no horizontal overflow |
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
budget. TinyEgoVLA's 12.8 MB exhibit assets are excluded from production to meet
that limit; its archive URL, source, media, records and local model continuation
archive are preserved. Its original export test still runs in CI and passes.

See `results/jekyll-build.log`, `results/published-links.txt`, and
`results/tiny-ego-archive-check.txt`. Upstream credits and license texts are
visible in the demo and retained with the deployment.
