Yes — we can build this, but I’d change the integration slightly from the naive “fork both and connect them.”

The clean target is:

```text
Browser
│
├── MuJoCo WASM
│    └── Unitree G1 12-DoF model
│
├── RL policy
│    └── 47 obs → 12 actions @ 50 Hz
│
├── PD controller
│    └── 500 Hz physics/control
│
└── UI
     ├── WASD velocity commands
     ├── reset
     ├── push robot
     └── telemetry
```

Unitree’s official deployment already gives us essentially the whole control algorithm in ~100 lines of Python: build the 47-dimensional observation, run the TorchScript actor, scale the 12 actions into desired leg joint positions, run PD control, and step MuJoCo at 2 ms.  Their G1 config specifies `simulation_dt=0.002`, decimation 10, hence 50 Hz policy inference, with 12 actions and 47 observations.

## One important correction

I would **not directly use the 29-DoF G1 model currently bundled in `dsc-labs/Mujoco_web` for V1**.

That web repo loads a full `g1_29dof_rev_1_0` model whose actuator block contains legs, waist, arms, wrists, etc.

But Unitree's pretrained locomotion checkpoint was deployed against their **G1 12-DoF model**, and their official `scene.xml` explicitly includes `g1_12dof.xml`.

So:

```text
BAD V1
29-DoF dsc model
        +
12-DoF policy
        ↓
hope dynamics/joint indexing match
```

versus:

```text
GOOD V1

dsc-labs browser renderer / MuJoCo integration
        +
Unitree's exact G1 12-DoF MJCF
        +
Unitree's exact pretrained policy
```

The second route removes a huge source of debugging.

---

# Is the checkpoint actually there?

Yes.

The official Unitree repo currently contains:

```text
deploy/pre_train/g1/motion.pt
```

and it is only about **146 KB**.

That size is tiny for browser deployment.

Unitree explicitly documents the workflow as:

```text
Train
 ↓
Play
 ↓
Sim2Sim MuJoCo
 ↓
Sim2Real
```

and the G1 Sim2Sim command uses the supplied pretrained policy.

So the policy/model pair is essentially already validated by Unitree in native MuJoCo.

---

# Browser inference

The checkpoint is TorchScript, so the agent should make an **offline one-time ONNX export**:

```text
motion.pt
   ↓
PyTorch
   ↓
policy.onnx
   ↓
onnxruntime-web
```

ONNX Runtime officially supports browser-side inference via `onnxruntime-web`, including CPU/WASM execution. ([ONNX Runtime][1])

For this tiny MLP:

```text
47 floats
   ↓
policy
   ↓
12 floats
```

I'd just use the WASM backend and force one inference thread initially. No WebGPU complexity is necessary.

---

# GitHub Pages/Jekyll issue

There is one very useful recent development here.

The `dsc-labs` README says its server requires COOP/COEP headers because its MuJoCo WASM build uses `SharedArrayBuffer`.

That's annoying for ordinary GitHub Pages.

However, current official MuJoCo browser bindings now provide **two builds**:

* single-threaded default: **no special security headers**
* multithreaded: requires COOP/COEP and `SharedArrayBuffer`

The official MuJoCo documentation explicitly says the standard single-threaded package works in modern browsers without those headers. ([GitHub][2])

So my preferred architecture is:

> **Reuse the useful renderer/scene-loading code from `Mujoco_web`, but migrate the runtime to official single-threaded `@mujoco/mujoco`.**

That should make static Jekyll/GitHub Pages deployment much cleaner.

This also means you don't need the Python server from the original web repo in production.

---

# What exactly should the project be?

I'd call it something like:

## **G1 Locomotion Playground**

Landing state:

```text
┌────────────────────────────────────────────┐
│        UNITREE G1 — RL LOCOMOTION          │
│                                            │
│                  🧍                        │
│                                            │
│                                            │
│          MuJoCo physics in-browser         │
├────────────────────────────────────────────┤
│ Command velocity                           │
│                                            │
│ Forward   +0.7 m/s                         │
│ Lateral   0.0 m/s                          │
│ Yaw       +0.0 rad/s                       │
│                                            │
│ W/S forward   A/D strafe   Q/E turn        │
│                                            │
│ [ Reset ]       [ Push Robot ]             │
│                                            │
│ Policy: Unitree PPO                        │
│ Policy Hz: 50                              │
│ Physics Hz: 500                            │
└────────────────────────────────────────────┘
```

The visitor controls **desired velocity**, while RL controls the joints.

That distinction is worth showing directly in the UI:

```text
You
 ↓
desired velocity
[vx, vy, yaw rate]
 ↓
RL locomotion policy
 ↓
12 target joint positions
 ↓
PD controller
 ↓
joint torques
 ↓
MuJoCo G1
```

---

# Agent implementation plan

I would give your coding agent this exact sequence.

## Phase 0 — establish native reference

Before touching JavaScript, clone:

* `unitreerobotics/unitree_rl_gym`
* `dsc-labs/Mujoco_web`

Run Unitree's native G1 MuJoCo demo:

```bash
python deploy/deploy_mujoco/deploy_mujoco.py g1.yaml
```

Acceptance criterion:

> The supplied G1 walks successfully using the supplied `motion.pt`.

This becomes the **golden reference implementation**.

Do not move forward until this works.

The agent should record:

```text
initial qpos
joint ordering
qpos indices
qvel indices
actuator ordering
observation values for first N policy ticks
policy outputs for first N policy ticks
```

These traces are how we verify the JS implementation later.

---

# Phase 1 — extract exact G1 policy contract

Create:

```text
docs/POLICY_INTERFACE.md
```

Document directly from Unitree's implementation:

```text
observation dimension: 47
action dimension: 12

obs[0:3]
    scaled base angular velocity

obs[3:6]
    projected gravity

obs[6:9]
    command * command_scale

obs[9:21]
    scaled joint position error

obs[21:33]
    scaled joint velocity

obs[33:45]
    previous action

obs[45:47]
    sin/cos gait phase
```

This layout is exactly what Unitree constructs in its native deployment code.

Constants should come verbatim from `g1.yaml` rather than being duplicated as unexplained magic numbers.

Create:

```js
g1PolicyConfig.js
```

containing:

```text
simulationDt
controlDecimation

kp[12]
kd[12]

defaultAngles[12]

angVelScale
dofPosScale
dofVelScale
actionScale
commandScale
```

---

# Phase 2 — export TorchScript → ONNX

Write:

```text
tools/export_policy.py
```

Pseudo-flow:

```python
policy = torch.jit.load("motion.pt")
policy.eval()

dummy = torch.zeros(1, 47)

torch.onnx.export(
    policy,
    dummy,
    "policy.onnx",
    input_names=["obs"],
    output_names=["action"],
    ...
)
```

Then test numerically:

```python
for 100 random observations:
    torch_out = torchscript(obs)
    onnx_out = onnxruntime(obs)

assert max_abs_error < tolerance
```

Suggested acceptance:

```text
max absolute error < 1e-5
```

If that tolerance proves unnecessarily strict because of export differences, document the observed value instead of silently loosening it.

Unitree's checkpoint is already an exported actor, not a training checkpoint, which makes this much easier.

---

# Phase 3 — create minimal browser MuJoCo app

Do **not** start by modifying all of the `dsc-labs` UI.

Strip it down.

Suggested repo:

```text
g1-web/
│
├── src/
│   ├── main.js
│   ├── simulation.js
│   ├── controller.js
│   ├── policy.js
│   ├── observations.js
│   ├── input.js
│   └── ui.js
│
├── public/
│   ├── robots/g1/
│   │   ├── scene.xml
│   │   ├── g1_12dof.xml
│   │   └── meshes/
│   │
│   └── models/
│       └── policy.onnx
│
├── tools/
│   ├── export_policy.py
│   └── validate_policy.py
│
└── tests/
```

Use Unitree's **12-DoF MJCF and meshes**, not the dsc 29-DoF model.

The Unitree repository is BSD-3-Clause.

The dsc wrapper repository itself is MIT licensed.

Keep the required copyright/license notices when redistributing either project's material.

---

# Phase 4 — port the native controller line-for-line

The JS controller should initially mirror `deploy_mujoco.py` as closely as possible.

Physics:

```js
simulationDt = 0.002; // 500 Hz
```

Every physics step:

```text
target q
   ↓
PD
   ↓
tau
   ↓
data.ctrl
   ↓
mj_step()
```

The native formula is:

```text
τ = kp * (q_target - q)
  + kd * (dq_target - dq)
```

with target velocity zero.

Every tenth physics step:

```text
build observation
↓
run policy
↓
action[12]
↓
targetQ =
    defaultAngles
    + actionScale * action
```

Again, that's exactly Unitree's deployment architecture.

Do **not** “improve” or refactor the algorithm yet.

Parity first.

---

# Phase 5 — validate browser vs Python

This is probably the most important instruction for the coding agent.

Don't debug “robot falls over” visually.

Build deterministic parity tests.

Python dumps:

```json
{
  "step": 500,
  "qj": [...],
  "dqj": [...],
  "quat": [...],
  "omega": [...],
  "obs": [...],
  "action": [...],
  "target_q": [...]
}
```

Browser dumps the same.

Compare:

```text
Python obs
vs
JS obs

Python action
vs
ONNX action

Python target_q
vs
JS target_q
```

This isolates four possible bugs:

```text
physics model mismatch
observation mismatch
policy mismatch
control mismatch
```

rather than treating falling over as one giant mystery.

---

# Phase 6 — command interface

Initially:

```text
W → vx +1
S → vx -1

A → vy +1
D → vy -1

Q → yaw +
E → yaw -
```

But don't instantly jump to values.

Smooth commands:

```text
current command
      ↓
rate limiter
      ↓
target command
```

Example:

```text
vx ∈ [-1.0, 1.0]
vy ∈ [-0.5, 0.5]
yaw ∈ [-1.0, 1.0]
```

Those exact UI limits should ultimately be constrained to the ranges used by or demonstrated to be stable for the policy rather than assumed from thin air.

Display:

```text
vx: 0.62 m/s
vy: 0.00 m/s
yaw: 0.14 rad/s
```

---

# Phase 7 — make the renderer portfolio-grade

Reuse the useful Three.js ideas from `dsc-labs`.

Their current browser app already:

* loads MuJoCo WASM
* creates Three.js bodies
* tracks MuJoCo `xpos/xquat`
* renders every frame
* uses OrbitControls
* supports dragging bodies and applying `mj_applyFT`

all directly in `main.js`.

That last one gives you a very easy **push recovery** feature.

Their code literally computes a force and applies it through:

```text
mj_applyFT(...)
```

before stepping MuJoCo.

So add:

```text
[ PUSH LEFT ]
[ PUSH RIGHT ]
```

or better:

```text
Push: 50 N ━━━━━●━━━ 300 N

[ ← Push ] [ Push → ]
```

That is way more compelling than walking alone.

---

# Phase 8 — fall detection

Simple MVP:

```text
if pelvis height < threshold
    fallen = true
```

or orientation-based:

```text
projected gravity
```

Then:

```text
Robot fell

[ RESET ]
```

Eventually show:

```text
Walk time:        23.8 s
Distance:          9.4 m
Average speed:     0.40 m/s
Pushes survived:   3
Falls:             0
```

Don't overbuild analytics in V1.

---

# Phase 9 — Jekyll integration

Build the simulator as an isolated static app:

```text
/assets/interactive/g1/
```

Then embed it exactly like Pong:

```html
<iframe
  src="/assets/interactive/g1/index.html"
  class="g1-demo">
</iframe>
```

Important:

Use the **single-threaded official MuJoCo WebAssembly package for V1** so GitHub Pages doesn't depend on custom COOP/COEP headers. Current MuJoCo documentation says the standard browser build does not require those headers. ([GitHub][2])

Force ONNX Runtime to one WASM inference thread as well if necessary:

```js
ort.env.wasm.numThreads = 1;
```

ONNX Runtime documents that setting `numThreads=1` disables multithreaded WASM inference. ([ONNX Runtime][3])

For a 146 KB locomotion actor, that's the sensible default.

---

# Phase 10 — UI polish

Keep the interface tiny.

I'd make it:

```text
        G1 LOCOMOTION

       [simulation]

 W/S forward
 A/D strafe
 Q/E rotate

 Speed       0.54 m/s
 Command vx  0.60 m/s

 [RESET]  [PUSH ROBOT]

──────────────────────────

Physics      MuJoCo
Policy       PPO
Inference    browser
Policy       50 Hz
Physics      500 Hz

How it works →
```

Then beneath it:

```text
You specify desired motion.
A reinforcement-learning policy controls
12 leg joints to realize that motion.
```

Perfect portfolio explanation.

---

# What I would explicitly tell the coding agent **not** to do

* Don't train another policy.
* Don't use the full 29-DoF model initially.
* Don't add arms.
* Don't add terrain.
* Don't add React unless there's a strong reason.
* Don't add a backend.
* Don't add WebSockets.
* Don't add WebGPU.
* Don't change the RL observation representation.
* Don't tune gains before matching the native implementation.
* Don't claim browser parity until numerical traces agree.

That scope discipline is important.

---

# Definition of done for V1

Your agent should not mark the task complete until all of these pass:

```text
[ ] Unitree native MuJoCo demo runs.

[ ] TorchScript → ONNX outputs numerically match.

[ ] Browser loads official G1 12-DoF MJCF.

[ ] Browser MuJoCo runs without a backend.

[ ] G1 stands/walks using the pretrained policy.

[ ] W/S changes forward command.

[ ] A/D changes lateral command.

[ ] Q/E changes yaw command.

[ ] Reset reliably restores initial state.

[ ] Push perturbation works.

[ ] Robot can recover from at least modest perturbations
    if supported by the supplied policy.

[ ] Works from a production static build.

[ ] Works when embedded in Jekyll.

[ ] Chrome desktop tested.

[ ] Safari/Firefox either tested or explicitly marked unsupported.

[ ] Third-party licenses retained.

[ ] README explains:
    MuJoCo → observation → PPO → target joints → PD → robot.
```

---

# Suggested task hierarchy for Codex

```text
EPIC: Browser-based Unitree G1 RL locomotion demo

1. Establish native Unitree reference
2. Export Unitree G1 TorchScript policy to ONNX
3. Add numerical policy parity tests
4. Port Unitree G1 12-DoF assets into web simulator
5. Replace legacy MuJoCo WASM runtime with official single-threaded package
6. Implement G1 controller
7. Implement exact 47-D observation builder
8. Integrate ONNX Runtime Web
9. Validate JS/Python control parity
10. Add velocity command keyboard input
11. Add reset / fall handling
12. Add push perturbations
13. Build minimal portfolio UI
14. Produce static bundle
15. Integrate bundle into Jekyll
16. Add licenses, attribution and technical README
```

## The key architecture

I'd tell the agent to preserve this boundary:

```text
                     ┌─────────────────┐
keyboard ───────────▶│ command manager │
                     └────────┬────────┘
                              │ vx vy yaw
                              ▼
                    ┌───────────────────┐
MuJoCo state ──────▶│ observationBuilder│
                    └─────────┬─────────┘
                              │ obs[47]
                              ▼
                    ┌───────────────────┐
                    │ ONNX PPO policy   │
                    └─────────┬─────────┘
                              │ action[12]
                              ▼
                    ┌───────────────────┐
                    │ action scaling    │
                    └─────────┬─────────┘
                              │ q_des[12]
                              ▼
                    ┌───────────────────┐
MuJoCo q,dq ───────▶│ PD controller     │
                    └─────────┬─────────┘
                              │ tau[12]
                              ▼
                    ┌───────────────────┐
                    │ MuJoCo WASM       │
                    │ 500 Hz            │
                    └───────────────────┘
```

That modularity also makes it trivial later to replace:

```text
Unitree PPO
```

with:

```text
Leo PPO
```

without touching the simulator.

And **that** is where the project becomes particularly valuable: V1 says *“I ported a production-style locomotion stack into the browser.”* V2 can say *“Now here is the same environment running a policy I trained myself.”*

I think this is a substantially better free-time project for you than another standard PyTorch toy. It is visually strong, uses real humanoid robotics software, has enough RL/control substance to discuss technically, and gives you another genuinely interactive thing on your website.

[1]: https://onnxruntime.ai/docs/tutorials/web/?utm_source=chatgpt.com "Web | onnxruntime"
[2]: https://github.com/google-deepmind/mujoco/blob/main/wasm/README.md?utm_source=chatgpt.com "mujoco/wasm/README.md at main · google-deepmind/mujoco · GitHub"
[3]: https://onnxruntime.ai/docs/tutorials/web/env-flags-and-session-options.html?utm_source=chatgpt.com "The ‘env’ Flags and Session Options | onnxruntime"
