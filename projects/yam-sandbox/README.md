# YAM tabletop sandbox

Two real articulated YAM arms, two objects, and a scripted pick-and-place controller in MuJoCo 3.11.0. Static browser route: **https://LeoMaglanoc.github.io/yam-sandbox/**. The left arm handles Cube; the right handles Cylinder. Tasks run separately while the other arm holds its home pose. Choose an object, Run, Pause/Resume, or Reset. Drag to orbit; pinch/scroll to zoom.

This is an independently assembled sandbox derived from the supplied `dream-yam-sim.zip` and the MIT-licensed I2RT YAM Menagerie model. It is not the Dream Labs platform, has no Dream-1 policy, no learned controller, no cloud inference and no Python server at runtime. Pickup and placement require MuJoCo contact and free-body dynamics. No object pose playback, weld, parenting, gravity removal or hidden attachment is used.

## Reproduce in Docker

From this directory:

```sh
docker build -t yam-sandbox:lab .
docker compose run --rm lab python -m unittest discover -s tests -v
docker compose run --rm lab python tools/evaluate.py
```

In an environment with a custom HTTPS proxy CA, supply it without baking it into the image:

```sh
docker build --secret id=proxy_ca,src=/etc/ssl/certs/ca-certificates.crt -t yam-sandbox:lab .
```

The Python base image is pinned by digest. `requirements.lock` pins runtime and mesh-build dependencies. Node browser tooling is pinned in `package-lock.json`. Python 3.12 / native and WASM MuJoCo 3.11.0 were used. Dependency details, hashes and commands are recorded in `results/`, `docs/BASELINE.md`, and `provenance.json`.

From the repository root, publish assets before local preview; source imports deliberately use the site's existing *published* shared runtime paths:

```sh
python3 scripts/publish-project-assets.py
python3 scripts/publish-project-assets.py --check
cd projects/yam-sandbox
docker compose up web
npm ci
CHROMIUM_PATH=/usr/bin/chromium npm run test:browser
CHROMIUM_PATH=/usr/bin/chromium npm run test:viewports
CHROMIUM_PATH=/usr/bin/chromium npm run record
```

Open `http://localhost:8000/assets/interactive/yam-sandbox/index.html`. `YAM_URL` overrides the browser test URL; the tools use installed Chromium rather than downloading a browser. Recordings also require `ffmpeg` on PATH (`/usr/bin/ffmpeg` in the validation environment). Jekyll builds the public `/yam-sandbox/` iframe route. Use the repository's full deployment workflow for SLAM and Party Panic build/copy steps before `scripts/check-project-links.py`.

## Models, planning and feedback

Original Menagerie commit: `62ab00f2bc44f6f20c1c9b7a13f3fb1dd41a4e35`. `upstream/yam.xml` and its license are unmodified. `scene/assets/` retains all 17 original STL bytes. `scene/zip_baseline.xml` preserves the attachment's original scene. Offline generation is in `tools/build_scene.py` (adapted attachment), `make_scene.py`, and `generate_references.py`. The latter solves bounded IK through exact MuJoCo FK, exporting only smooth actuator targets, never world-pose animations. Both arms retain original kinematics, inertias, joint limits, arm servos, primitive collision geometry and finger coupling.

The original scene needed these documented changes for reliable grasping:

- Gripper kp/kv 100/10 → 600/20, with force explicitly capped at ±12 N.
- Cylinder half-height .031 → .045 m; radius .024 m and mass .09 kg retained. This moves the contact region toward its center of mass. The original short cylinder slipped out.
- Cylinder condim 6, sliding/torsional/rolling friction 1.1/.02/.002. The original condim 3 did not activate its torsional/rolling coefficients.
- Separate reachable goals, (-.22,-.22) and (.22,-.18), and tested lower approach/lift poses. No robot geometry was stretched or collision removed.

The original model has primitive collision shapes alongside STL visual meshes; it does not collide every STL triangle. Robot collision group 3 stays active in physics but hidden in the renderer; group 2 visuals and group 0 world/props are shown. A local renderer adapter fixes cylinder display scaling without modifying any existing demo's shared renderer. Render-only 3 mm vertex clustering reduces tiny CAD detail; all original meshes remain loaded by the physical model. `display-meshes.json` uses compiled MuJoCo mesh-local frames and is checked against the scene hash. The canvas uses a bounded pixel ratio; HTML controls retain native resolution. These render changes never affect physics or the success oracle.

Physics and control use fixed 2 ms steps, independently of rendered frame rate. Actual joint error, velocity and contact guard phase transitions; each phase times out. Browser rendering uses requestAnimationFrame and a bounded fixed-step accumulator (up to .1 simulated seconds of work per frame), so severe render stalls slow simulation pace instead of changing timestep or skipping task phases. Hidden tabs do not advance physics.

**Grasp:** finger contact and ≥5 cm lift above settled height continuously for .2 simulated seconds. **Place:** table contact, no finger contact, XY goal error <5 cm, linear speed <.05 m/s, height within1.5 cm of settled height continuously for .5 seconds. Lost established contact during transport causes failure. Full details and failure experiments: [docs/CONTROLLER.md](docs/CONTROLLER.md).

## Validation and limitations

Final native evaluation: **20/20 nominal + 10/10 predeclared ±5 mm offsets for each object**. Browser: **10/10 nominal each**, repeated against the final Jekyll/minified build. Disabled-contact negative controls fail; a test removing contacts after lift also fails correctly. Six native tests (including the two original structural tests) cover model contract, FK/limits/table clearance, finger direction, pose-write prohibition and lost contact. Native/browser phase times, controls and contact counts match; maximum cylinder position discrepancy is approximately .021 mm (small solver/numerical differences; no discrepancy correction is applied). `results/parity.json` records measured component differences.

Chrome/Chromium testing covers desktop1440×900, phone portrait390×844 and landscape844×390, both task completions, pause freezing simulation time, resume, reset, About, errors and missing requests. Screen captures and two recordings are in `results/`. The user approved phone emulation: **no physical Android device or Chrome computer-agent tool was available**. Tests use installed Chromium154 with Playwright and SwiftShader software WebGL on cloud Linux. Viewport FPS and memory observations are software-browser measurements, not physical-phone benchmarks; see `results/viewport-validation.json` and `docs/VALIDATION.md`. Actual phone hardware remains unmeasured. Wasm heap and JS heap are recorded separately; browser process/Android peak memory is not established.

This is a fixed-location, scripted reference controller, not a general manipulation planner. Small offsets were tested; arbitrary positions, different props, simultaneous arms, moving targets and robust recovery are unsupported. Model/grip changes need a fresh full evaluation. Performance depends on browser/GPU. Task failure is shown rather than converted into animation success.

## Continue from a checkpoint

Six full integration-state checkpoints are under `checkpoints/`: ready, lifted and placed for each object. They include MuJoCo integration state, controller phase/dwell/target state, trace and exact model/reference/controller hashes. They are simulation snapshots; there are no training weights.

```sh
docker compose run --rm lab python tools/save_checkpoints.py checkpoints/cube-lifted.json
docker compose run --rm lab python tools/save_checkpoints.py checkpoints/cylinder-lifted.json
```

Both lifted snapshots were restored and completed successfully (`results/checkpoint-*-resume.json`). Restore refuses mismatched engine/model/reference/controller hashes. To improve the controller, preserve old snapshots/results in a dated subdirectory, then regenerate:

```sh
docker compose run --rm lab python tools/make_scene.py
docker compose run --rm lab python tools/generate_references.py
docker compose run --rm lab python tools/build_display_meshes.py
docker compose run --rm lab python -m unittest discover -s tests -v
docker compose run --rm lab python tools/evaluate.py
docker compose run --rm lab python tools/save_checkpoints.py
```

If downloading the source again, run `tools/fetch_yam.py --output upstream`, then copy `upstream/assets/*.stl` into `scene/assets/` before generation. Keep the pinned source and MIT attribution. Browser references and display assets reject a scene hash mismatch. Re-run browser evaluations, parity comparison and asset publishing after any change. Checkpoint commits separate native baseline, controller/evaluation, browser port, and website validation; their history is retained on main.

See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and `licenses/` for YAM/MuJoCo/Three.js terms.
