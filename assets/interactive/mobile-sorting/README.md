# Endless Mobile Manipulation

TIAGo continuously sorts randomly positioned blue/red boxes into matching bins.
Analytic top-down grasp planning, Cartesian IK, smooth arm trajectories and
wheel-driven differential navigation run with contact-based parallel-jaw grasping
in MuJoCo WASM. Everything executes locally in the browser. There is no learning,
camera perception, backend, Python runtime or runtime CDN.

Site route: `/mobile-sorting/`. Standalone entry:
`/assets/interactive/mobile-sorting/`.

## Run and verify with Docker

From the repository root:

```sh
docker compose -f assets/interactive/mobile-sorting/docker-compose.yml build sorting-tools
docker compose -f assets/interactive/mobile-sorting/docker-compose.yml up -d sorting-site
```

Open <http://localhost:8003/assets/interactive/mobile-sorting/>.

```sh
# WASM integration, recovery, reset and multi-seed endurance tests
docker compose -f assets/interactive/mobile-sorting/docker-compose.yml run --rm sorting-tools npm test
# Independent native MuJoCo structural/contact checks
docker compose -f assets/interactive/mobile-sorting/docker-compose.yml run --rm sorting-tools \
  python -m unittest discover -s tests -p 'test_*.py' -v
# Browser interaction checks in the Docker-provided Chromium
docker compose -f assets/interactive/mobile-sorting/docker-compose.yml run --rm sorting-tools \
  node tests/browser.cjs
# Build the complete Jekyll site
docker compose run --rm --no-deps --entrypoint /bin/sh jekyll -lc 'bundle exec jekyll build'
# Serve and verify the generated full-height iframe route
docker compose -f assets/interactive/mobile-sorting/docker-compose.yml up -d sorting-built-site
docker compose -f assets/interactive/mobile-sorting/docker-compose.yml run --rm sorting-tools \
  node tests/built-route.cjs
```

The endurance suite can take several minutes. `SORTING_RESULTS` writes its JSON
report to a supplied directory. Browser screenshots/reports default to
`/tmp/mobile-sorting-browser` inside the tools container; set `SORTING_ARTIFACTS`
to a mounted directory to retain them, for example
`/workspace/assets/interactive/mobile-sorting/test-results`.

To test the laptop's **installed Google Chrome**, run it with a dedicated test
profile, then connect the Docker test harness to that browser:

```sh
google-chrome --remote-debugging-port=9225 \
  --user-data-dir=/tmp/mobile-sorting-chrome --no-first-run --no-default-browser-check \
  http://localhost:8003/assets/interactive/mobile-sorting/

docker run --rm --network host --user "$(id -u):$(id -g)" \
  -v "$PWD:/workspace" \
  -e CHROME_CDP=http://127.0.0.1:9225 \
  -e SORTING_URL=http://127.0.0.1:8003/assets/interactive/mobile-sorting/ \
  -e SORTING_ARTIFACTS=/workspace/assets/interactive/mobile-sorting/test-results \
  mobile-sorting-sorting-tools node tests/browser.cjs
```

The host-network CDP command is for Linux. It leaves the original Chrome tab
available for inspection and closes only the test contexts. There is no need to
install Node, Python or Playwright on the laptop.

The same host-network command can run `tests/built-route.cjs` with
`SORTING_BUILT_URL=http://127.0.0.1:8004`, or `tests/live-chrome.cjs` for a 40-second
normal-speed check in the original Chrome preview tab. The latter requires CDP
and leaves that tab open with the autonomous simulation running.

To regenerate the robot from the pinned upstream revision and scene:

```sh
docker compose -f assets/interactive/mobile-sorting/docker-compose.yml run --rm \
  --user "$(id -u):$(id -g)" sorting-tools python tools/prepare_robot.py
docker compose -f assets/interactive/mobile-sorting/docker-compose.yml run --rm \
  --user "$(id -u):$(id -g)" sorting-tools python tools/prepare_scene.py
```

Regeneration needs network access; normal operation and tests use checked-in
assets. See `THIRD_PARTY_NOTICES.md` for model provenance and modifications.

## Controller and architecture

- `src/simulation.js`: shared local MuJoCo runtime, model loading, joint/address
  bindings, reset and 2 ms physics steps. Gravity feedforward applies only to
  arm joints. Parked object bodies have collisions disabled and gravity
  compensated; active objects receive no artificial carrying force.
- `src/ik.js`, `math.js`: damped least-squares site-Jacobian IK, quaternion
  orientation error, joint limits and bounded updates. A separate scratch
  `MjData` solves targets without writing arm poses into live physics.
- `src/motion.js`: sampled Cartesian paths solved into joint references, with
  quintic time interpolation and actuator tracking. Descent/lowering targets
  use 1.5 mm IK tolerance; approach/retract targets allow 4 mm. The actual
  end-effector and joint errors gate completion, with deadlines for recovery.
  Wheel velocity commands have acceleration limits. A heading controller
  turns toward the station, drives, brakes, and aligns final yaw. Arrival
  requires both pose and velocity tolerances; the arm moves only after stopping.
- `src/objects.js`: deterministic seeded spawning with conservative separation,
  oldest-object selection, color assignments and a fixed five-body pool.
  Four input objects are preferred; replenishment waits if no safe spot exists.
  A held box uses the fifth slot. A settled bin object remains visible for
  1.4 simulated seconds before recycling. Recycling clears velocity and
  warm-start acceleration; the compiled model never grows.
- `src/task.js`: explicit condition-driven FSM, grasp planning, test lifts,
  placement verification, timeouts, retreat and retries. Parallel-jaw symmetry
  checks the complete approach/descent/lift/retract path before choosing between
  symmetric grasp yaws. If needed it tries the other horizontal axis. Three failed attempts recycle an object; earlier failures
  defer it briefly while another is selected. Floor picking is out of scope.
- `src/renderer.js`: renders actual body transforms, lightweight visual meshes,
  station labels, orbit/pinch controls, selection ring and debug target marker.
- `src/main.js`: fixed-step accumulator, bounded catch-up, page visibility,
  responsive controls, statistics, explanation and a regression-harness API.
- `_pages/mobile-sorting.md`, `_layouts/mobile-sorting-fullscreen.html`: existing
  site pattern of a full-height static simulation iframe.

The gripper closes across the shorter horizontal box dimension. It performs
approach → descent → close → test lift → verify → retract → drive → lower →
open. Successful grasp verification requires actual object elevation and
proximity to the gripper. Success is counted only after the released box lies
inside its matching bin and its linear velocity is small. **No weld, attachment,
object-follow animation or carried-object teleportation is used.** Object pose
writes are confined to reset and lifecycle recycling; test failure injections
also deliberately edit poses.

Known object/body poses are intentionally supplied by the simulator. This demo
shows manipulation and control, without making a perception or learning claim.

## Performance and mobile behavior

- One free-base robot, seven arm joints, two fingers, two wheel joints, and five
  free boxes: 47 velocity degrees of freedom, 53 generalized positions.
- Original caster joints are replaced by support spheres; torso/head are fixed.
  Primitive collision shapes and disabled robot self-contact reduce solver cost.
- Visual robot meshes total approximately 1.57 MB; the shared WASM payload is
  about 10.1 MB uncompressed. All assets are local. Transfer compression depends
  on hosting configuration; first load/compilation can still be noticeable.
- Physics runs at 500 Hz. Rendering is capped at 30 fps. The animation loop limits
  catch-up to 40 physics steps per frame and discards excessive backlog rather
  than changing the physics timestep. Slow machines can run below real time.
- Coarse-pointer devices disable shadows and cap DPR at 1.25. Desktop DPR is
  capped at 1.5. Sustained low animation rates reduce DPR to 1 and disable shadows.
- Touch orbit, pinch zoom, 44 px pause/reset targets, portrait and short landscape
  layouts, fullscreen where supported, and explicit background-tab suspension.

This is a simplified simulation, not a calibrated digital twin. There is no
general collision-aware arm planner or arbitrary obstacle navigation. Conservative
overhead paths, an open floor, fixed docking poses and safe object placement keep
the task within a tested workspace. Joint-limited poses can cause genuine retries;
the demo recovers and reports them. Actual phone hardware/Safari performance is
not established by desktop touch emulation.

## Validation

`tests/physics.test.js` exercises the actual WASM/controller pipeline: model
contract, 100 spawn seeds, contact lift, held-object turning and translation,
physical correct-bin release, forced failed-grasp/drop recovery, reset while
carrying and a long three-seed bounded-object run. `tests/test_scene.py` loads and
checks the derivative independently in native MuJoCo.

`tests/browser.cjs` tests installed Chrome over CDP or container Chromium at
1440 × 900, 390 × 844 and 844 × 390. It checks startup, pause/resume/reset,
mouse/touch orbit, scroll/pinch zoom, explanation/debug controls, autonomous
sorting, finite visible control bounds, page errors and runtime network requests.
Screenshots are visually inspected. See `VALIDATION.md` for measured results.

## Website description

**Endless Mobile Manipulation** — An autonomous TIAGo continuously sorts randomly
positioned objects into two bins using analytic grasp planning, inverse
kinematics, wheel-driven differential navigation and contact-based parallel-jaw
grasping. The entire MuJoCo simulation runs locally in the browser.
