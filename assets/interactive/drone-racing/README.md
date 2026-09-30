# FPV Drone Racing — Control in the Loop

A custom approximate 5-inch FPV quad races a closed ten-gate 3D circuit using MuJoCo WASM, a periodic offline spline, tracking MPC and a geometric flight controller. Autopilot flies continuously: the reference wraps while the physical state, velocity and simulation clock continue. Everything runs locally with vendored Three.js/WebGL and the existing shared G1 MuJoCo runtime. No backend or WebGPU is required; G1 is unmodified.

Open `/drone-racing/` on the built site, or:

```bash
docker compose -f assets/interactive/drone-racing/docker-compose.yml up -d drone-site
# http://localhost:8001/assets/interactive/drone-racing/
```

**Autopilot** follows the periodic racing line. **Fly** provides stabilized manual flight; releasing controls holds position. **Race AI** uses manual flight against a continuously looping, recorded steady MuJoCo/MPC lap. Switching modes starts a new race. Reset preserves the selected mode and camera. W/S move forward/back, A/D strafe, Q/E yaw, R/F or arrows change altitude; Space pauses and Backspace resets. Touch uses left altitude/yaw and right forward/strafe sticks. Blur and page hiding pause and clear controls.

Cross the lit gate from its approach side, in order. The first crossing of gate 1 starts timing; only crossing every other gate and returning to gate 1 completes a lap. Current, last and best lap times use interpolated plane-intersection simulation time. Lap completion never resets the vehicle. Collisions count contact episodes, with both per-lap and total counts. Race AI displays your lap/current/best times beside the recorded AI lap time. Reset count persists for the page session.

## Vehicle and physics

`src/vehicle-config.js` is the canonical source for mass, inertia, motor positions, thrust limits, response time and visual dimensions. `models/fpv.xml` contains the runtime scene template; `vehicleXml()` inserts the configured plant. The offline generator reads this same config through Node.

- Mass: **0.65 kg**; opposite-motor wheelbase: **0.22 m**; prop diameter: **0.127 m**.
- Diagonal inertia: **[0.0023, 0.0023, 0.004] kg m²**, an approximate symmetric demo model.
- Body: **0.11 × 0.045 m**, approximately **0.07 m** high; simplified body box and four arm capsules handle collisions.
- Four rotors at XY signs (+,+), (−,+), (−,−), (+,−); reaction signs +,−,+,−. Motor radial distance is half the wheelbase.
- Thrust `f = 8e-6 ω² N`; reaction torque `±1.2e-7 ω² N m`, speeds in rad/s; maximum **6 N per rotor**.
- First-order motor response `ω += (1-exp(-dt/0.018)) (ω_command-ω)` uses an **18 ms** time constant. Reset starts with motors already at hover speed. Actual motor speeds drive prop animation, using translucent discs at high RPM.
- Linear world drag is `−mass × 0.12 × velocity`. Gravity is 9.81 m/s². Collision clearance uses a conservative **0.175 m** radius including the prop sweep.

This is an original procedural visual model: carbon X frame, motor bells, electronics stack, battery/strap, FPV camera/lens and antenna. There is no borrowed drone mesh. Visual and collision geometry share scale and origin. The model is an illustrative FPV quad, **not a calibrated digital twin**. Battery offset, prop contact geometry, ESC nonlinearities and aerodynamic coupling are omitted.

World Z is up; body X is forward and Y left. MuJoCo uses wxyz quaternions; Three.js uses xyzw. Free-joint translation velocity is world-frame, angular velocity body-frame. Rotor thrust and torque are transformed into the world wrench at the COM through `xfrc_applied`; the live vehicle is never kinematically replayed.

## Control and trajectory

`periodic C² cubic → 25 Hz tracking MPC → 125 Hz geometric controller → mixer → motor dynamics → 250 Hz MuJoCo`

The existing six-state tracking MPC is retained: 18 steps at 40 ms (0.72 s horizon), 32 projected-gradient iterations with analytic adjoint gradients and warm start. Stage weights are position 16, velocity 4, acceleration reference 0.08 and command variation 0.1; terminal position/velocity weights are tripled. XY acceleration is bounded to ±6 m/s², Z to [−5,6]. References sample across the lap seam naturally. MPC has no hard gate/collision constraints.

Manual position control requests reference acceleration + position PD (5 / 3.8) + bounded integral bias + drag compensation. Autonomy substitutes MPC acceleration for position PD. The compensated acceleration defines desired body Z; reference tangent defines heading. Geometric attitude gains are 400/32 for roll/pitch and 100/20 for yaw. Nominal mass and inertia remain fixed under disturbances.

The pure-Python offline generator solves a cyclic cubic spline through the gate centers. Position, velocity and acceleration match at every knot including the lap seam; jerk is piecewise constant and may jump. Heading uses atan2(vy,vx), with a low-speed fallback; the controller uses heading vectors, so ±π has no attitude discontinuity. A 0.4 s approach phase puts spawn before the start gate, with a transient from stationary launch. The track has height changes, an elevated gate, opposing chicane turns and a faster south straight. Gate yaw/pitch defines rendering, MuJoCo frames, local crossing coordinates and valid direction.

Deterministic time scaling checks sampled speed ≤7 m/s, acceleration ≤5.8 m/s² and tilt ≤34°. The shipped **13.75 s** reference peaks at **4.48 m/s** and **33.26°** tilt: the chicane acceleration limit determines speed. This is sampled feasibility screening, not time-optimal optimization or a proof of rotor feasibility. The full plant rollouts validate flight.

Wind applies **1 N** laterally for 0.7 simulated seconds; side impulse adds **1.2 m/s** lateral velocity. Mass adds 20% centered payload, and motor 3 loses 10% thrust and reaction torque. Mass changes preserve live position, velocity and time. Repeated gusts replace the gust; impulses accumulate. Reset removes all disturbances.

## Validation

```bash
cd assets/interactive/drone-racing
python3 tools/generate_trajectory.py
python3 tools/validate_trajectory.py
npm test
npm run validate
# Browser tooling is isolated in Docker:
cd ../../..
docker compose -f assets/interactive/drone-racing/docker-compose.yml build drone-tools
docker compose -f assets/interactive/drone-racing/docker-compose.yml run --rm drone-tools node tests/browser.cjs
```

The benchmark records **21 consecutive nominal laps**, per-lap time, max/RMS tracking error and collisions, plus four-lap disturbance runs. It regenerates the steady one-lap ghost and `tests/benchmark-results.json`; regenerate after changing course, controller or dynamics. Baseline V1 had 16 passing tests, a nominal 11.20 s one-way run with zero collisions, 0.088 m max error and 0.020 m RMS error. Desktop/mobile baseline browser checks passed.

V2 nominal run: **21 laps, zero collisions, zero resets**. Stationary launch peaks at **0.701 m** error; steady final lap is approximately **0.052 m max / 0.030 m RMS**, with no growth across laps. Steady lap time is **13.75 s**. All four disturbance runs complete four ordered laps without collisions or resets. These are deterministic simulated measurements, not real-flight claims; exact metrics are retained in the benchmark JSON.

Tests cover canonical vehicle scale, hover/max thrust, mixer inversion, motor response, torque axes, controller steps/recovery, three-minute hover, oriented gate geometry/direction/margin, ordered laps and best timing, periodic spline derivatives, heading quadrants, and MPC gradients/bounds/seam sampling. Browser tests execute real WASM, including 20 continuous laps on desktop and mobile emulation, finite state, reset count, input, touch, ghost and camera controls. Ignored `artifacts/` holds desktop chase/FPV, mobile portrait/landscape, start-line and banked-corner screenshots and timing reports.

## Rendering and limitations

The chase camera follows actual horizontal velocity, using body-forward at low speed, with time-based smoothing and turn lag. It sits about 1.05 m behind / 0.38 m above at 55° FOV. FPV position, forward and up are rigidly attached to the quad. The compact arena uses track paint, cones, barriers, gate supports, numbered tubular gates, fog and a cheap ground blob; there are no expensive shadow maps. Reference path is closed, actual trail is bounded to 3,000 samples, and ghost playback interpolates periodically across its seam.

Physics/render schedules remain independent. Catch-up is capped at 80 ms / 20 steps per frame; excess wall time is discarded, so slow hardware can play below real time without altering simulation-time lap measurements. Pixel ratio starts at ≤1.5 and adapts down to 0.75; path buffers and physics/MPC working buffers are reused. Diagnostics measure CPU submission and solver wall time, excluding asynchronous GPU completion. Software-rendered Docker Chromium is useful for layout/control regressions, not representative of native phone GPU performance. Real Android device profiling and public-site smoke testing remain external validation tasks.

No RL, vision, SLAM, WebGPU, backend, multiplayer or nonlinear time-optimal solver is included. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
