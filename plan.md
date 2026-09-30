# Autonomous Drone Racing — Browser MuJoCo Demo

## Goal

Build a polished interactive **autonomous drone racing demo** for:

`LeoMaglanoc/LeoMaglanoc.github.io`

The final experience should run locally in the browser on desktop and mobile, including a Galaxy S24 FE-class phone.

Core concept:

**Human vs autonomous quadrotor racing through a fixed 3D gate course.**

The autonomous drone follows a **precomputed aggressive racing trajectory**, while a small **online MPC controller** handles trajectory tracking and disturbance recovery.

The important architecture is:

```text
OFFLINE
Crazyflow dynamics / parameters
        ↓
trajectory optimization
        ↓
precomputed racing trajectory
        ↓
JSON / spline coefficients

BROWSER
precomputed trajectory
        ↓
small tracking MPC
        ↓
inner flight controller
        ↓
4 rotor commands
        ↓
MuJoCo WASM physics
        ↓
state feedback
        └─────────────→ MPC
```

Do **not** attempt to port Crazyflow/JAX itself into the browser.

Crazyflow should be used as:

- a dynamics/control reference;
- a source of Crazyflie parameters where appropriate;
- an offline trajectory-optimization tool.

The browser runtime should remain lightweight JavaScript + MuJoCo WASM, following the architectural style of the existing G1 demo.

---

# Implementation review and v1 decisions

The architecture and milestone sequence are sound. V1 uses a clamped C² cubic
spline with offline time scaling and explicit feasibility checks. Crazyflow is
an offline parameter/control reference (cf2x_L250), not a browser dependency.
Full nonlinear time-optimal CasADi optimization is a later research upgrade;
this implementation must not claim that the spline is time-optimal.

Use a single shared course JSON for MJCF gate collision geometry, rendering,
offline trajectory generation, and gate validation. Gate crossing uses the
interpolated plane intersection with a drone-radius margin and ordered,
directional crossings. A ghost must be a recorded MuJoCo/controller rollout,
not reference-path playback, and must carry its measured finish time.

Use simulation time for race timing; bound frame catch-up and report slowdown.
Reset all controller integrals, MPC warm starts, timers, trails, disturbances,
and input. Pause/blur must release input and avoid accumulated catch-up.
Mass changes alter MuJoCo mass while the controller keeps nominal mass, so
recovery demonstrates actual feedback. Solver times are measured wall time.

Docker is required for serving, trajectory tooling, physics/unit regressions,
and Chromium desktop/mobile-emulation tests. Real Galaxy S24 FE performance
and deployed GitHub Pages smoke testing remain external validation until
measured on the device and after deployment. Do not equate emulation with
phone benchmarking. Keep G1 source unchanged.

# 0. Inspect the existing website first

Before changing anything:

Inspect:

```text
assets/interactive/g1/
assets/interactive/race/
assets/interactive/robot-runner/
```

Understand:

- how MuJoCo WASM is loaded;
- how Three.js rendering is integrated;
- how simulation stepping is scheduled;
- how mobile controls work;
- how reset/pause are implemented;
- how static assets are served by GitHub Pages;
- how interactive demos are linked from the homepage.

Run the existing site locally and verify the G1 demo works.

Do not modify the G1 implementation.

Create the drone project independently under something like:

```text
assets/interactive/drone-racing/
```

Suggested structure:

```text
assets/interactive/drone-racing/
├── index.html
├── drone.css
├── README.md
├── THIRD_PARTY_NOTICES.md
├── models/
│   └── crazyflie.xml
├── trajectories/
│   └── race_v1.json
├── src/
│   ├── main.js
│   ├── simulation.js
│   ├── drone.js
│   ├── controller.js
│   ├── mpc.js
│   ├── trajectory.js
│   ├── input.js
│   ├── renderer.js
│   ├── course.js
│   ├── game.js
│   └── ui.js
├── tools/
│   ├── generate_trajectory.py
│   ├── validate_trajectory.py
│   └── benchmark_controller.py
└── tests/
```

Keep modules small and explicit.

---

# 1. Milestone A — physically plausible browser quadrotor

First get a quadrotor flying reliably in MuJoCo.

Use one free rigid body with four rotor locations.

State:

```text
position        p ∈ R³
orientation     q
linear velocity v ∈ R³
angular velocity ω ∈ R³
```

Motor commands:

```text
ω1, ω2, ω3, ω4
```

Use a simple rotor model:

```text
Fi = kf * ωi²
τi = km * ωi²
```

Compute:

```text
total body thrust
roll torque
pitch torque
yaw torque
```

Transform the body thrust into world coordinates and apply the resulting wrench to the MuJoCo body each physics step.

For v1, do NOT implement blade-element momentum aerodynamics.

Optional simple aerodynamic drag is sufficient.

### Acceptance tests

The drone must:

- fall under gravity with motors off;
- hover approximately when commanded to hover thrust;
- roll/pitch when differential motor thrust is applied;
- yaw when opposing motor pairs change appropriately;
- collide with the floor and gates through MuJoCo;
- reset deterministically;
- remain numerically stable for a multi-minute simulation.

Do not proceed to racing until these tests work.

---

# 2. Milestone B — inner flight controller

Implement a normal cascaded flight controller.

Preferred hierarchy:

```text
desired position / velocity / acceleration
        ↓
position controller
        ↓
desired thrust vector
        ↓
desired attitude
        ↓
attitude / body-rate controller
        ↓
desired body wrench
        ↓
motor mixer
        ↓
4 rotor commands
```

Crazyflow's Mellinger-style controller can be used as the conceptual/reference implementation.

Do not blindly copy large parts of Crazyflow.

Port only the small mathematical components we actually need.

Document every equation and frame convention.

Be extremely careful about:

- quaternion ordering;
- world vs body frame;
- sign of gravity;
- rotor numbering;
- rotor spin direction;
- yaw torque sign;
- MuJoCo coordinate conventions.

### Controller tests

Create deterministic tests for:

```text
hover
+1 m altitude step
+1 m x-position step
90° yaw command
small initial roll disturbance
lateral velocity disturbance
```

The drone should recover without exploding or obvious sustained oscillation.

---

# 3. Milestone C — build the racing course

Create one attractive but lightweight fixed 3D course.

Start with approximately 6–10 gates.

Use simple geometry:

- gate frames;
- floor;
- several obstacles;
- clear start/finish.

Do not build a giant environment.

Target race duration:

```text
roughly 8–20 seconds
```

for the autonomous controller.

Implement robust gate detection using plane crossing plus gate bounds rather than simple distance-to-center.

Track:

```text
current gate
gates cleared
lap time
collisions
reset count
```

Add two cameras:

```text
CHASE
FPV
```

FPV should be mounted rigidly to the drone.

---

# 4. Milestone D — human flight mode

Before autonomy, make the game enjoyable manually.

Desktop:

```text
W/S   forward/back
A/D   left/right
Q/E   yaw
R/F or arrows   altitude
```

Mobile:

two virtual sticks.

Recommended semantics:

```text
left stick:
    vertical = altitude / vertical velocity
    horizontal = yaw

right stick:
    vertical = forward/back
    horizontal = strafe
```

These commands should feed the stabilization controller rather than raw motors.

Human mode should feel like a simple drone game, not like flying an unstabilized FPV racing quad.

Optional later:

```text
EXPERT MODE
```

for direct attitude/rate control.

---

# 5. Milestone E — offline racing trajectory

Now add the actual autonomy.

Use Crazyflow offline only.

Create:

```text
tools/generate_trajectory.py
```

The desired progression is:

### First implementation

Generate a smooth trajectory through all gate centers using:

- splines;
- minimum-snap;
- or another robust smooth trajectory method.

This gets the full system working quickly.

### Second implementation

Upgrade to trajectory optimization using Crazyflow's symbolic dynamics / CasADi.

Optimize something approximately like:

```text
minimize total race time

subject to:

xdot = f(x, u)

motor bounds

velocity / attitude constraints

gate crossing constraints

initial state constraints

final state constraints
```

Do not block the entire project on achieving globally optimal racing.

A locally optimized aggressive trajectory is sufficient.

Export only what the browser needs.

Example:

```json
{
  "dt": 0.02,
  "samples": [
    {
      "t": 0.00,
      "position": [0, 0, 1],
      "velocity": [0, 0, 0],
      "acceleration": [0, 0, 0],
      "quaternion": [1, 0, 0, 0],
      "angularVelocity": [0, 0, 0]
    }
  ]
}
```

If spline coefficients are substantially smaller, prefer splines.

Do not ship Python/JAX/CasADi to the browser.

---

# 6. Milestone F — online tracking MPC

This is the key browser autonomy component.

The MPC is **not responsible for planning the race**.

It only tracks the precomputed trajectory.

Use a deliberately small model initially.

Recommended v1 MPC state:

```text
x = [px, py, pz, vx, vy, vz]
```

Control:

```text
u = [ax, ay, az]
```

Prediction model:

```text
p(k+1) = p(k) + v(k) dt
v(k+1) = v(k) + u(k) dt
```

Tracking objective:

```text
Σ [
    position error
  + velocity error
  + control effort
  + control-rate penalty
]
```

with optional:

```text
acceleration limits
velocity limits
```

Start around:

```text
MPC rate:       20–50 Hz
horizon:        ~0.5–1.0 s
prediction dt:  ~0.03–0.05 s
```

These are starting points only.

Profile them.

The MPC output becomes a desired acceleration/reference for the inner flight controller.

### Solver

Do not introduce a huge optimization runtime.

For v1, implement a small deterministic solver such as:

- projected gradient descent;
- condensed small QP;
- another bounded iterative solver.

Warm-start using the previous solution.

Measure actual solve time every iteration.

Expose:

```text
last MPC solve time
average solve time
95th percentile solve time
```

Do not fake these values.

---

# 7. Milestone G — disturbances

This is important because otherwise MPC just looks like trajectory playback.

Add:

```text
WIND GUST
SIDE IMPULSE
+20% MASS
MOTOR 3 -10%
```

At minimum implement:

```text
wind / impulse
mass perturbation
```

The autonomous controller should visibly depart from the nominal line and recover.

Render:

```text
reference trajectory
actual trajectory
MPC predicted trajectory
```

Different line styles are enough.

This is one of the core educational features.

---

# 8. Milestone H — game modes

Final UI should expose three primary modes:

```text
FLY
AUTOPILOT
RACE AI
```

### FLY

Human controls the drone.

### AUTOPILOT

Camera follows the autonomous drone.

### RACE AI

Human races against either:

- a simultaneously simulated autonomous drone; or
- preferably for mobile performance, a ghost generated from an autonomous rollout.

Start with the ghost if simultaneous full simulations hurt performance.

Show:

```text
Human time
Autonomous time
Gate progress
Collisions
```

Do not add complicated scoring initially.

Lap time is enough.

---

# 9. Visual design

Match the clean engineering style of the existing G1 demo.

Main focus should remain the 3D simulation.

Small telemetry panel:

```text
MODE        MPC
SPEED       4.2 m/s
GATE        4 / 8
TIME        6.82 s
MPC SOLVE   1.8 ms
```

Optional expandable:

```text
CONTROL PIPELINE

trajectory
    ↓
tracking MPC
    ↓
desired acceleration
    ↓
Mellinger controller
    ↓
motor mixer
    ↓
MuJoCo
```

Avoid turning the page into a dashboard.

---

# 10. Performance requirements

Mobile performance is a first-class requirement.

Do not assume WebGPU.

The baseline must work with:

```text
CPU/WASM physics
WebGL rendering
JavaScript controller
```

Implement adaptive rendering quality if useful.

Physics/control and rendering should have independent rates.

Example architecture:

```text
physics      200–500 Hz simulated
inner ctrl   100–250 Hz
MPC           20–50 Hz
render        30–60 Hz
```

Again, benchmark rather than treating these exact rates as requirements.

Add a visible diagnostics mode reporting:

```text
FPS
physics stepping time
MPC solve time
render time
```

Test desktop Chrome first.

Then test Android Chrome/mobile emulation and fix:

- touch controls;
- orientation changes;
- resolution scaling;
- excessive allocations;
- GC spikes.

Avoid allocating new arrays every physics iteration where possible.

---

# 11. Validation

Create automated tests for:

```text
rotor wrench calculation
motor mixer
quaternion transforms
trajectory interpolation
MPC cost
MPC constraints
gate crossing
controller reset
```

Create one deterministic browser simulation test:

```text
spawn
→ autonomous controller enabled
→ complete full course
→ all gates cleared in correct order
→ no NaN
→ no reset
```

Also record:

```text
nominal lap time
maximum tracking error
RMS tracking error
number of collisions
average MPC solve time
p95 MPC solve time
```

Add one disturbance regression test:

```text
apply lateral impulse mid-race
→ controller recovers
→ race still completes
```

---

# 12. Attribution

Both Crazyflow and UAVSimulator may be used as references.

If code/equations/assets are copied or substantially adapted, record their origin in:

```text
THIRD_PARTY_NOTICES.md
```

Retain required MIT notices.

Prefer independently implementing the small browser runtime from documented equations instead of copying unnecessary Python infrastructure.

---

# 13. Scope boundaries

Do NOT add yet:

```text
RL training
neural policies
WebGPU
vision-based control
SLAM
multi-agent swarms
full aerodynamic CFD/BEM
procedurally generated tracks
backend/server
accounts
leaderboards
multiplayer
```

No feature creep.

The demo should tell one story extremely well:

> A physically simulated quadrotor races through a fixed course using a precomputed racing trajectory and online feedback control.

---

# 14. Definition of done

The project is done when:

```text
✓ opens from GitHub Pages
✓ works with no backend
✓ MuJoCo physics runs locally
✓ human can fly with keyboard
✓ human can fly with touch controls
✓ FPV and chase cameras work
✓ autonomous drone clears every gate
✓ autonomous trajectory is precomputed offline
✓ online MPC performs trajectory tracking
✓ disturbance causes visible deviation and recovery
✓ reference / actual / MPC prediction can be visualized
✓ race timer works
✓ reset works reliably
✓ no NaNs after repeated runs
✓ reasonable desktop performance
✓ usable mobile performance
✓ measured runtime performance is displayed
✓ README explains architecture honestly
✓ licensing/attribution is complete
```

---

# Development strategy

Do this incrementally.

Do **not** implement the entire system and debug it at the end.

The required sequence is:

```text
1. MuJoCo quadrotor physics
2. stable hover
3. position/attitude controller
4. manual flight
5. gates + race logic
6. precomputed reference trajectory
7. basic trajectory following
8. online MPC
9. disturbances
10. race/ghost mode
11. optimization + polish
12. mobile profiling
```

Commit after each working milestone.

For each milestone:

```text
implement
→ add/update tests
→ run locally
→ inspect browser console
→ verify no regression
→ commit
```

If a sophisticated component blocks progress, implement the simpler version first and leave a clear upgrade path.

In particular:

```text
smooth spline before time-optimal trajectory
simple MPC before nonlinear MPC
simple rotor model before advanced aerodynamics
ghost race before two full simultaneous simulations
```

The final demo should prioritize **correct architecture, robust browser execution, and fun interaction** over maximum research complexity.