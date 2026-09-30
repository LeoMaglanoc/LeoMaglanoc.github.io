# Drone Racing — Control in the Loop

A static browser demo: one 29 g quadrotor, eight gates, four rotor commands, MuJoCo WASM physics, a precomputed racing spline and a small online tracking MPC. Everything runs locally. Three.js is vendored; the existing G1 MuJoCo JS/WASM files are shared without modifying G1. No CDN, server-side control, JAX, or WebGPU is required.

Open `/drone-racing/` on the built website or use Docker:

```bash
docker compose -f assets/interactive/drone-racing/docker-compose.yml up -d drone-site
# http://localhost:8001/assets/interactive/drone-racing/
```

Fly with W/S forward/back, A/D left/right, Q/E yaw, R/F or ↑/↓ altitude. Two touch sticks use left altitude/yaw and right forward/strafe. Releasing the controls holds position. Space pauses and Backspace resets. Switching modes starts a fresh race; Reset preserves the mode and camera. Blur or hiding the page pauses and clears input. Fly through the currently lit gate in the +X direction; missing a gate requires returning to its approach side.

- **Fly:** stabilized human flight.
- **Autopilot:** the tracking MPC follows the offline spline.
- **Race AI:** human flight against a translucent, recorded MuJoCo/MPC rollout. The ghost's finish time comes from gate intersections in that rollout, not the spline's duration.

The race clock starts on reset/mode selection and stops at the eighth gate. The start pad is at X=0; the last gate is the finish, X=24. The reference continues to X=26 and settles after the finish. Collisions count contact episodes, not every physics step. Reset count persists for the page session. Trails are bounded to the last 3,000 points.

## Architecture and conventions

`offline C² spline → tracking MPC (25 Hz) → acceleration → geometric attitude/thrust controller (125 Hz) → rotor speeds → MuJoCo (250 Hz)`

The world is right-handed with Z up and gravity `[0,0,-9.81]`. Body X points forward and Y left. MuJoCo quaternions are **wxyz**, while Three.js quaternions are xyzw; rendering explicitly reorders them. MuJoCo free-joint translation velocity is world-frame and rotational velocity body-frame. The model has an explicit inertia; visual/collision geometry does not implicitly set its mass.

Rotors 1–4 have body XY signs `(+,+),(-,+),(-,-),(+,-)` and reaction-torque signs `+,-,+,-`. These are our own numbering convention, not Crazyflow's motor order. Each rotor produces `f_i=kf*ω_i²` along body +Z and reaction torque `spin_i*km*ω_i²`. Total roll/pitch torque is `r_i × [0,0,f_i]`. The analytic inverse mixer maps the requested wrench to nonnegative squared speeds and clips to 0.12 N per motor. Commands are rad/s; the quadratic thrust coefficient is approximately the Crazyflow RPM-squared fit converted to rad/s-squared. We omit its small linear RPM term. The model is Crazyflie-inspired, not a calibrated digital twin. Inertia and isotropic drag are simplified demo values; motor response is instantaneous.

Manual position control requests `a = a_ref + 5(p_ref-p) + 3.8(v_ref-v) + integral_bias + 0.12v`. For autonomy, MPC supplies acceleration instead of the position PD term. A bounded position-error integral helps reject unmodeled mass and motor errors. Gravity compensation adds +9.81 to acceleration Z. The desired body Z is the normalized compensated acceleration; desired X/Y use the reference heading. The geometric attitude error is `0.5 Σ(current_axis × desired_axis)`, converted to body coordinates. Body torque is `J(400 e_R - 32 ω)`, and collective thrust is nominal mass times the compensated acceleration projected onto current body Z. `xfrc_applied` applies the world wrench at the COM; no state is kinematically replayed for the live drone.

The 6-state MPC predicts `p_next=p+dt*v`, `v_next=v+dt*u`, with 18 steps at 0.04 s (0.72 s horizon). Stage cost is `16||p-p_ref||² + 4||v-v_ref||² + 0.08||u-a_ref||² + 0.1||u-u_previous||²`; terminal position/velocity weights are tripled. A 32-iteration projected gradient solve with analytic adjoint gradients and shifted warm start bounds XY acceleration to ±6 m/s² and Z to [-5,6]. There are no hard velocity, gate, or collision constraints in this tracking solver. The offline path and flight-controller bounds provide the feasible nominal course. The UI reports actual `performance.now()` durations, including initial solves, over a rolling 1,500-solve window; timer quantization can produce a measured 0.000 ms individual solve.

Wind applies 0.045 N laterally for 0.7 simulated seconds; impulse adds 1.2 m/s of lateral velocity (equivalent to a mass-scaled impulse). Mass adds 20% centered payload mass to the physics, leaving nominal controller mass and inertia unchanged. Motor 3 loses 10% thrust and reaction torque. Repeated gusts replace the active gust; repeated impulses accumulate. Reset removes all disturbances and clears solver/controller history.

One `course.json` defines gate openings, obstacles, collision MJCF and rendering. Gate clearing uses a directional plane intersection interpolated between positions with a 7 cm drone margin, in order. Gate frame collisions use MuJoCo. Chase follows heading; FPV position, view direction and up vector are rigidly attached to the body.

## Reproduce and validate with Docker

```bash
docker compose -f assets/interactive/drone-racing/docker-compose.yml build drone-tools
docker compose -f assets/interactive/drone-racing/docker-compose.yml run --rm drone-tools python3 tools/generate_trajectory.py
docker compose -f assets/interactive/drone-racing/docker-compose.yml run --rm drone-tools python3 tools/validate_trajectory.py
docker compose -f assets/interactive/drone-racing/docker-compose.yml run --rm drone-tools node --test tests/*.test.js
docker compose -f assets/interactive/drone-racing/docker-compose.yml run --rm drone-tools node tools/benchmark_controller.js
docker compose -f assets/interactive/drone-racing/docker-compose.yml up -d drone-site
docker compose -f assets/interactive/drone-racing/docker-compose.yml run --rm drone-tools node tests/browser.cjs
```

The benchmark regenerates `trajectories/ghost_v1.json` from the exact shipped physics and controller, plus `tests/benchmark-results.json`. Regenerate the ghost whenever dynamics, course or controller change. The generator uses a clamped cubic spline through the course centers with zero endpoint velocities and deterministic time scaling until sampled speed, acceleration, tilt and collective-thrust checks pass. Crazyflow supplies the parameter/control reference only; **this is not Crazyflow/CasADi time-optimal trajectory optimization**. Checks at 10 ms spacing are a sampled feasibility screen, not a proof of rotor/attitude feasibility; the full physics regressions check the resulting flight.

Unit/physics tests cover wrench/mixer inversion, quaternion transforms, trajectory derivatives, gate bounds/direction/order, MPC gradients against finite differences, cost/bounds/reset, gravity, hover, rotor torque, floor collision, position/altitude/yaw steps, disturbances and three-minute stability. Browser tests execute the real WASM controller on desktop and Android-sized Chrome emulation, repeat complete laps, exercise keyboard flight and simultaneous touch sticks, verify camera switching, reset, ghost mode, portrait/landscape layout and runtime errors. Screenshots and machine-specific measurements are written to ignored `artifacts/`.

Measured nominal lap: **11.20 s**, zero collisions; maximum tracking error **0.088 m**, RMS **0.020 m** across the full 16.6 s rollout including settling. Separate side-impulse, wind, mass and motor-loss runs finish all gates with zero collisions; largest tracking error is **0.203 m** (mass). These are deterministic simulated results. Browser solver averages on this development host are approximately 0.04–0.09 ms with p95 0.10–0.20 ms; individual wall times vary by device and browser precision.

## Performance and remaining validation

Rendering and physics have independent schedules, with bounded 80 ms catch-up and at most 20 steps per animation frame. Slow frames discard excess wall time; simulation-time lap results remain consistent while real-time playback may slow. Diagnostics display achieved simulation/wall-time ratio, FPS, CPU physics submission, render submission and solver timings. Render time excludes asynchronous GPU completion. Pixel ratio starts at most 1.5 and adapts down to 0.75 when FPS is low; there are no shadow maps. Trails use reusable GPU buffers; physics state views and MPC working buffers are reused.

Docker Chromium uses software rendering on this host: roughly 18–21 FPS with near-real-time physics in the measured short run. That is a test environment measurement, not a Galaxy S24 FE benchmark or a guarantee of native GPU performance. Real Android Chrome/device profiling and public GitHub Pages smoke testing still need to be performed. The browser test does not emulate ARM CPU/GPU throughput. Time-optimal CasADi optimization remains a documented future upgrade; a fixed 12.6 s feasible spline is shipped now.

See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for references and licenses.
