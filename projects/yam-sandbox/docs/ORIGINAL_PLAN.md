# Agent task — YAM tabletop pick-and-place on Leo's website

## Objective

Starting from the attached `dream-yam-sim.zip`, add a **physically simulated**, mobile-friendly dual-YAM tabletop manipulation demo to `LeoMaglanoc/LeoMaglanoc.github.io`, deployed as a self-contained static GitHub Pages route at `/yam-sandbox/`. A visitor can choose **Cube** or **Cylinder**, press **Run**, observe a scripted pick-and-place with real MuJoCo actuator control and object contacts, then **Pause**, **Resume**, or **Reset**.

**The deeper goal is not more features.** It is a reliable, repeatable, inspectable grasp-and-place loop whose robot and object states come only from simulated dynamics. It is **not** the original Dream Labs platform, has no AI policy, and does not require a Python service at runtime.

## Professional audit: what to do differently

1. **What a robotics simulation professional adds:** inspect joint frames, reachability, contact geometry and gripper actuation *before* designing the UI; establish a native MuJoCo reference; distinguish reference joint targets from actual simulated motion; instrument failure modes; test Python/browser behavioral parity and mobile performance. Do not infer successful grasp from animation timing.
2. **Raw materials:** unpack and inspect the supplied ZIP (`scripts/build_scene.py`, `scripts/fetch_yam.py`, `run_sim.py`, tests); inspect the pinned, unmodified `i2rt_yam/yam.xml`, STL meshes, and MIT `LICENSE` from MuJoCo Menagerie; inspect `mjModel`, `mjData` (`qpos`, `qvel`, `ctrl`, `xpos`, `site_xpos`), actual geom contacts, actuator ranges and gripper/finger equality constraints; inspect the *current* website repository rather than copying another demo's appearance.
3. **Specific tools:** native Python `mujoco` and `mj_jacSite`/FK for reachability, damped-least-squares IK with joint limits; named-site Cartesian waypoints converted to smooth joint-position actuator targets; fixed-rate physics stepping and guarded task state machine; `@mujoco/mujoco`'s single-thread WebAssembly binding **or the site's existing compatible pinned local MuJoCo WASM**; existing `projects/shared/mujoco-three-renderer.js` and site-local Three.js; Python unittest/pytest, Node assertions, headless browser/Playwright, Jekyll asset publisher and route checker; phone-browser measurements. Verify API compatibility rather than assuming the Python and JS APIs match.
4. **Independent evidence:** native and browser contact/pose traces, an automatic success oracle, repeated fresh resets, measured frame time and physics pace on Android, screenshots at three viewports, CI build/link checks, and documented failure cases. The demo is correct only if an observer can lift the cube away from the gripper or disable grasp contacts and see the placement fail instead of continuing as an animation.

## Verified starting points / constraints

- ZIP is a **scene generator and native viewer**, not an autonomous pick-place implementation. Structural-only tests passed when inspected; **full scene compilation, contacts and actual grasping have NOT yet been validated**. Treat this as a starting point, not a working benchmark.
- ZIP contains no STL files. Its `scripts/fetch_yam.py` pins MuJoCo Menagerie commit `62ab00f2bc44f6f20c1c9b7a13f3fb1dd41a4e35`; retain the exact source/commit/attribution and MIT license.
- Existing website patterns: `projects/g1-loco-manipulation/`, `projects/shared/mujoco-three-renderer.js`, `projects/dexterous-rl/runtime/mujoco.js`, `projects/mobile-sorting/vendor/{three.module.js,OrbitControls.js}`, `_pages/loco-manipulation.md`, `_layouts/loco-manipulation-fullscreen.html`, `scripts/project-assets.json`, `scripts/publish-project-assets.py`, `scripts/check-project-links.py`. Reinspect these at the current HEAD before implementation.
- Site is Jekyll + GitHub Pages. Publish **static** browser assets, not Python or a remote rendering service. There is no reason to install `dreamlabs` in the browser build.

## Execution plan — sequential gates

### Gate 0 — establish the actual model and packaging (do this first)

1. Make a feature branch from the current website HEAD; do not overwrite unrelated work. Put the attached ZIP at a known workspace location, e.g. `incoming/dream-yam-sim.zip`, and extract under a scratch directory. If it is missing, report the blocker; do **not** replace it with an invented scene.
2. Run the ZIP's existing structural tests; fetch the pinned `yam.xml`, MIT license and every referenced STL; run `scripts/build_scene.py` and `run_sim.py --headless --seconds 4` in a real Python environment. Fail loudly on missing assets, XML compilation errors, unstable robot poses, 14 actuator mismatch, or camera count mismatch. Verify the source's named gripper TCP/grasp sites rather than guessing orientation.
3. Produce `projects/yam-sandbox/docs/BASELINE.md` containing dependency versions/hashes, exact arm bases, all meaningful frame transforms, actuator IDs, actual gripper open/close command direction and distances, tabletop top height, object initial poses, observable collision geom pairs, and the existing limitations of the ZIP. Compare `left_` and `right_` models for symmetry, reachability, collisions, and joint limits. Calibrate gripper direction via the **measured** gap between fingers vs actuator command.
4. Perform a reachability sweep for each object and prospective goal. The ZIP has **one** target near the right arm; replace/supplement it with two visibly separate reachable goals only after demonstrating reachability with exact FK/IK and no table collision. Keep the real YAM kinematics and paired finger equality constraints. Do not change robot link lengths, delete collisions, or move the robot through an object to make the demo pass.

**Gate 0 exit:** the true Menagerie scene compiles and settles locally, both YAM grippers actuate in the verified direction, and each selected object/goal has a collision-free pose path. Archive raw logs.

### Gate 1 — solve ONE real grasp natively before porting anything

Build `projects/yam-sandbox/tools/native_pick_place.py` (reuse/refactor ZIP code, preserving provenance), `tools/generate_references.py`, `tools/evaluate.py`, and tests. Start **only with the left arm picking the cube**; the right arm holds a safe home pose.

- **Inputs:** scene + fixed target pose, selected arm, current qpos/qvel, object pose, contact records.
- **Planner:** `world T grasp_site` targets with safe approach, vertical descent, close, lift, transfer, descend, release, retreat. Use MuJoCo FK/Jacobians + damped-least-squares IK or an equally testable Jacobian solver with joint-limit margins; confirm every waypoint is reachable and that gripper orientation is physically compatible with the object.
- **Controller:** smooth bounded joint position targets through the **existing** 6+1 position actuators per arm; no direct assignment to arm qpos during task. Use an explicitly tested gripper command with the original finger coupling. Respect actuator ranges; log saturated or nonconvergent control.
- **Task state machine:** `HOME → APPROACH → ALIGN → DESCEND → CLOSE → VERIFY_GRASP → LIFT → TRANSFER → LOWER → RELEASE → RETREAT → VERIFY_PLACE → DONE` or `FAILED`. Each transition is gated on actual sim state (error/velocity/contact/height) with a timeout; not just elapsed animation time.
- **Contact policy:** keep the object as a free body. **Never** directly set object `qpos`, weld it, parent it to an end-effector, disable object gravity, turn off collision, or visually interpolate it. Measure finger–object contacts, separation from the tabletop, grasp retention, and release; diagnose slips using actual MuJoCo contact data. Changes to prop friction/size are allowed **only if documented**; first try realistic velocity and grip tuning.
- **Trajectory format:** export reference *actuator/joint targets* and state-machine trigger parameters to compact deterministic JSON. Do **not** export object or robot world-pose animation. Include script/toolchain hash and source scene hash. If fixed references cannot reliably close the loop, keep event-driven IK/controller in the runtime; do not patch over failures with pose correction.

**Oracle:** `grasped` requires observed gripper–object contact and object lift at least **0.05 m above its settled table height** for **0.2 simulated seconds**; `placed` requires object resting on the tabletop, horizontal center within **0.05 m** of the selected goal, linear speed below **0.05 m/s**, with no persistent finger–object contact, for **0.5 simulated seconds**. Calculate thresholds relative to actual geom dimensions and documented goal locations; do not use timer completion as success.

**Gate 1 exit:** save native traces and summary showing **20/20** nominal fresh-reset cube runs with authentic pickup and placement, plus **at least 8/10** runs with predeclared small (±5 mm XY) object offsets. A failure must report phase, joint error, contact, object pose/velocity, and timeout reason. If fixed references cannot meet these, refine or use state feedback instead of weakening the test. No right-arm expansion until this passes.

### Gate 2 — add the second object and transfer the same controller to WebAssembly

1. Implement a second task: **right YAM picks and places the cylinder** into its own tested reachable goal. Run tasks **sequentially**, not simultaneously; keep both arms physically present. Reuse the same planner/controller/oracle, changing only calibrated grasp frames and goal definitions.
2. Produce one shared source of truth for scene and browser assets. Generate XML from the ZIP-derived Python scene builder **offline**; bundle XML, the original STL meshes, attribution/license and reference-target JSON under `projects/yam-sandbox/`. Do not fetch GitHub assets or install Python when a visitor loads the page.
3. Use the website's existing compatible MuJoCo WASM loader, import map, Three.js modules and `MujocoThreeRenderer`. Check that the pinned runtime parses the generated XML and exposes every required API. Use `MjModel.from_xml_path`, live `MjData`, and `mj_step`. In renderer use **visual model group 2** plus world/objects group 0; exclude robot collision group 3, preserving those collision geoms in physics. Verify actual geom group values before hardcoding filters. Robot movement and object pose must come exclusively from MuJoCo state.
4. Separate a fixed simulation/control clock from `requestAnimationFrame`. Example: physics timestep retained from native reference (or an explicitly documented, parity-tested alternative), control targets at 50 Hz, browser rendering at device pace. Never change physics delta according to FPS, silently skip controller phases, or let async reset/delete race with stepping. Cleanup wasm model/data and WebGL resources on rebuild.
5. Compare native/browser traces with the **same scene, reference data and initial conditions** at named phase boundaries: actuator targets, joint qpos, gripper gaps, object pose/velocity, lift/contact events, and final goal. Record the maximum differences and explain any solver/precision discrepancies instead of assuming exact floating-point identity.

**Gate 2 exit:** both tasks achieve **20/20 nominal native**, **at least 8/10 ±5 mm offset native**, and **10/10 nominal browser runs**, with the same physical success oracle and no teleportation. If this fails, leave the demo clearly marked experimental and do not claim success.

### Gate 3 — integrate into the existing site with a restrained UI

Create **new** source under `projects/yam-sandbox/`:

```
projects/yam-sandbox/
  README.md  THIRD_PARTY_NOTICES.md  asset-manifest.json
  index.html  style.css
  scene/bimanual_scene.xml  scene/assets/*.stl
  references/cube.json  references/cylinder.json
  src/main.js  src/simulation.js  src/controller.js  src/tasks.js  src/renderer.js
  tools/  tests/  results/
_pages/yam-sandbox.md
_layouts/yam-sandbox-fullscreen.html
```

Use a route `/yam-sandbox/` with an iframe/full-viewport wrapper, patterned on the existing G1 loco-manipulation page. Use a **single clean 3D scene** with camera orbit/pinch zoom, small object selector (`Cube` / `Cylinder`), `Run`, `Pause/Resume`, `Reset`, phase label and a genuine `Success/Failed` readout. Optional About panel: “Scripted control in live MuJoCo physics. No learned policy. Based on MIT-licensed YAM Menagerie.” Do not add natural language, arbitrary object drag, policy inference, cloud calls, multi-scene switches, an extensive debug panel, or sound.

Add source files to `scripts/project-assets.json`; publish to `assets/interactive/yam-sandbox/`; add route to `scripts/check-project-links.py`; integrate **one** navigable link/card where live demos are already listed (inspect the real homepage, do not add a redundant new category). Keep original demos and renderer untouched unless a small shared, regression-tested fix is strictly necessary. Follow current responsive/fullscreen iframe behavior. Do not claim forced browser Fullscreen API or landscape lock.

**Gate 3 exit:** the route loads as a static page directly on desktop and Android, and all controls survive repeated task switching and reset. Loading failures show a meaningful message, not a frozen canvas.

### Gate 4 — prove correctness and publishable quality

- **Physics tests:** source MJCF compilation and named-object/actuator lookup; grasp-site transform and IK FK roundtrip; joint limits and actuator mappings; finger opening direction; absence of qpos writes after task reset; contact/lift/release/goal dwell oracle; perturbation failures; 20+10 native trials per object.
- **Browser tests:** deterministic task completion for both objects; pause freezes sim time; resume continues; reset returns object/robot and clears contacts/controllers; scene model swaps do not leak memory; deliberate failed grasp yields `FAILED`, not `Success`; browser/native phase-trace comparisons; no missing file requests or console exceptions.
- **Visual/phone:** inspect physical desktop Chrome plus Android Chrome (portrait **390×844** and landscape **844×390** at minimum). The camera must keep the arms, cube, cylinder, goals and contact moment visible; finger tips cannot be hidden by collision meshes. Measure render FPS, sim pace, load time, network transfer and peak memory on the phone; aim for at least **25 rendered FPS** while running and document measured actuals rather than faking an FPS label. If that target is missed, tune renderer pixel ratio, shadow cost, geometry and physics step count **without degrading the grasp oracle**.
- **Website:** execute project unit tests; `python3 scripts/publish-project-assets.py`; `python3 scripts/publish-project-assets.py --check`; build Jekyll using the site's existing workflow; run `python3 scripts/check-project-links.py`; verify `/yam-sandbox/` and existing demos. Confirm LICENSE/NOTICE distribution and that binary assets are tracked/hosted statically.
- **Evidence:** commit `results/native-evaluation.json`, `results/browser-evaluation.json`, `results/parity.json`, two brief screen recordings (one per object), screenshots for desktop/portrait/landscape, version/hash provenance, and a candid `README.md` describing the simulation/control stack, what is and isn't learned, failure modes and observed phone speed.

## Minimal acceptance checklist (non-negotiable)

- [ ] Actual YAM MJCF/articulated joints/grippers/mesh collisions, duplicated from official MIT source.
- [ ] Actual MuJoCo WASM rigid-body physics at `/yam-sandbox/`, no backend/API/policy.
- [ ] Two selectable scripted, sequential tasks: left cube and right cylinder.
- [ ] Object lift and placement caused by arm joint actuators and gripper contact, **not pose replay or hidden attachment**.
- [ ] Deterministic reset, working Pause/Resume, visible errors and objective task oracle.
- [ ] Native success, browser success, native/browser trace evidence and phone measurements.
- [ ] Original site demos not broken; asset publisher `--check`, Jekyll and link checker pass.
- [ ] MIT license/provenance included and all claims accurately worded.

## Deliverables and stop rules

Produce code on a feature branch with reviewable commits at **(A) native physics baseline, (B) contact-driven controller+evaluation, (C) browser port, (D) website integration+validation**, plus a concise report of commands actually run, logs/results, screenshot/recording locations, known failures, and final page URL if deployed. Use independent code review/tests for each checkpoint. **Do not claim completion** if real MuJoCo assets did not load, if either object is teleported/attached, if tasks only pass visually, or if Android performance is unmeasured. Do not push to `main` or deploy without the repo owner's approval unless your standing agent instructions already explicitly authorize it.

## Primary sources (verify at start)

- Supplied `dream-yam-sim.zip` (this task's starting artifact, source code and structural tests).
- Upstream YAM model, MJCF, STL, MIT license: https://github.com/google-deepmind/mujoco_menagerie/tree/main/i2rt_yam
- MuJoCo WASM bindings and contact semantics: https://github.com/google-deepmind/mujoco/blob/main/wasm/README.md
- MuJoCo Jacobians / contact programming: https://github.com/google-deepmind/mujoco/blob/main/doc/programming/simulation.rst
- Live site repo: https://github.com/LeoMaglanoc/LeoMaglanoc.github.io
