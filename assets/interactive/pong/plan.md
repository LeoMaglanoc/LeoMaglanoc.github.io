# Project: Play Against My RL Pong Agent

## Objective

Build an end-to-end RL demo where:

1. A Pong agent is trained offline in Python using reinforcement learning.
2. The trained policy is exported to ONNX.
3. A human can play Pong against the trained policy directly on my existing Jekyll/GitHub Pages website.
4. No backend/server is required for inference.
5. The project should remain small, understandable, and portfolio-quality.

Do not implement PPO from scratch. Reuse mature RL libraries.

---

# High-level architecture

## Training side

Python:

Pong environment
→ Gymnasium interface
→ Stable-Baselines3 PPO
→ trained PyTorch policy
→ ONNX export
→ validation that ONNX and SB3 choose equivalent actions

## Deployment side

Jekyll / GitHub Pages:

HTML Canvas Pong
→ JavaScript game simulation
→ construct normalized RL observation
→ ONNX Runtime Web
→ policy output
→ AI paddle action

The browser must perform inference locally. There must be no Python server.

---

# Core design decision

Use a **state-based observation**, not images.

Observation:

[
ball_x,
ball_y,
ball_vx,
ball_vy,
ai_paddle_y,
human_paddle_y
]

Optionally include additional terms only if demonstrably useful, e.g.:

[
relative_ball_y_to_ai,
relative_ball_y_to_human
]

Normalize all observations consistently.

Prefer values approximately within [-1, 1].

The exact same observation transformation MUST be used:

* during Python training
* during Python evaluation
* during ONNX validation
* in JavaScript browser inference

Centralize/document this transformation carefully.

---

# Action space

Discrete:

0 = move up
1 = stay
2 = move down

The AI controls one paddle.

The human controls the other paddle using:

* ArrowUp / ArrowDown
* optionally W / S

---

# Pong physics

Keep physics deliberately simple and deterministic.

Required state:

* ball position
* ball velocity
* left paddle position
* right paddle position
* score

Required mechanics:

* paddle movement
* collision with top/bottom wall
* collision with paddles
* point scoring
* reset after a point
* game reset

Ball speed may gradually increase after paddle hits, but avoid unnecessary complexity.

Important:

The Python training simulation and browser JavaScript simulation must behave as similarly as reasonably possible.

Prefer implementing a small shared specification of constants:

* board width / height
* paddle height
* paddle velocity
* ball radius
* ball velocity
* timestep
* collision rules

Store these constants in an easily comparable form.

---

# Phase 1 — Python environment

Create a Gymnasium-compatible environment.

Suggested location:

rl/
pong_env.py

Environment:

class PongEnv(gym.Env)

Implement:

reset(seed=None, options=None)

step(action)

render() optional

observation_space

action_space

Use Gymnasium's current API:

obs, reward, terminated, truncated, info

reset() returns:

obs, info

Support deterministic seeding.

Run Gymnasium's environment checker.

---

# Opponent design

The learning agent should initially play against a scripted opponent.

Create at least two scripted opponents:

## Easy

Moves toward the ball with:

* limited speed
* reaction delay and/or
* noise/error

## Strong

Tracks the ball more accurately but is still beatable.

The scripted opponent must not be perfect.

Opponent implementations should be modular.

Example:

class Opponent:
def action(state): ...

class EasyOpponent(Opponent)

class TrackingOpponent(Opponent)

Later self-play should be possible without rewriting the environment.

---

# Reward

Keep reward sparse initially.

Recommended:

+1 when RL agent scores
-1 when RL agent concedes
0 otherwise

Do NOT add complicated reward shaping unless training fails.

If shaping becomes necessary, document why and keep it minimal.

---

# Episodes

Prefer one episode consisting of multiple points rather than one single ball exchange.

Example termination:

first player to 7 points

or

maximum number of simulation steps

Document whichever design is chosen.

---

# Phase 2 — PPO training

Use Stable-Baselines3 PPO with MlpPolicy.

Suggested:

from stable_baselines3 import PPO

Start with standard/default PPO settings and modify only where necessary.

Do not spend excessive effort hyperparameter tuning.

Training script:

rl/train.py

Requirements:

* deterministic/random seed option
* configurable number of timesteps
* configurable opponent
* checkpoints
* TensorBoard logging
* final model
* evaluation after training

CLI should support something like:

python -m rl.train 
--timesteps 500000 
--opponent tracking 
--seed 0

Exact CLI design is flexible.

---

# Phase 3 — evaluation

Create:

rl/evaluate.py

Evaluate agent against:

1. easy scripted opponent
2. strong scripted opponent
3. optionally earlier model checkpoints

Report:

* games played
* win rate
* mean score differential
* optionally rally length

Run enough games that the result is meaningful.

Support multiple random seeds.

Example output:

Opponent        Win rate
Easy              98%
Tracking           76%

Do not claim performance without evaluation.

---

# Phase 4 — optional self-play

Only implement this after the baseline PPO agent works.

Do not make self-play necessary for the MVP.

Preferred approach:

Maintain an opponent checkpoint pool:

checkpoints/
step_100k.zip
step_250k.zip
step_500k.zip
...

During later training:

sample opponents from:

* scripted opponent
* older policy checkpoints

Do NOT always train current policy against itself.

Goal:

increase robustness rather than maximize complexity.

If self-play makes the implementation substantially brittle, leave it as a documented follow-up.

---

# Phase 5 — ONNX export

Create:

rl/export_onnx.py

Export only what is required for deterministic inference.

Do not export training machinery or value-function outputs unless needed.

Desired browser API:

observation → action logits/probabilities → argmax action

For discrete PPO, ensure the exported model exposes enough information to recover the deterministic action correctly.

Be careful:

Stable-Baselines3 export examples require appropriate policy wrapping/post-processing. Verify discrete-action behavior rather than assuming the raw ONNX output is already the final action.

Output:

website/assets/pong/pong_policy.onnx

or the appropriate path for the existing Jekyll repository.

---

# ONNX parity test

This is mandatory.

Create an automated test that generates many random valid observations.

For each observation:

SB3 deterministic action
vs
ONNX deterministic action

They must agree.

Example:

1000 random observations

expected:
100% action agreement

If numerical ties make perfect equality unrealistic, investigate and document the discrepancy rather than ignoring it.

Do not proceed to browser integration until this works.

---

# Phase 6 — browser implementation

Build the playable version using:

* HTML
* JavaScript
* HTML Canvas
* ONNX Runtime Web

Do not use React unless the existing website already requires it.

Keep integration friendly to Jekyll/GitHub Pages.

Suggested files:

assets/pong/
pong.js
pong.css
pong_policy.onnx

pages or equivalent:
pong.md / pong.html

Follow the existing site's structure and conventions rather than forcing this exact layout.

---

# Browser game

Implement a canvas-based Pong game.

The browser owns the interactive game simulation.

Human:

left paddle

Agent:

right paddle

At each control timestep:

1. update physics
2. build the observation
3. normalize observation exactly as in training
4. run ONNX inference
5. obtain action
6. move AI paddle
7. render

Do not run ONNX inference unnecessarily at the full display refresh rate if a lower control frequency is sufficient.

Separate:

render frequency

from

policy/control frequency

Example:

60 FPS rendering
20–30 Hz policy updates

Tune if necessary.

---

# Browser loading behavior

Load the ONNX model once when the page initializes.

Show:

Loading RL agent…

until inference is ready.

Then enable:

Play

If ONNX loading fails:

show a useful error message rather than silently breaking the page.

Use WASM as the default ONNX Runtime execution provider unless there is a compelling reason to use WebGPU.

This model should be tiny enough that GPU acceleration should not be required.

---

# UI

Keep UI clean and aligned with the visual language of the existing website.

Required:

* game canvas
* score
* Play / Restart button
* keyboard instructions
* small description of the AI

Suggested text:

“Play Pong against a PPO agent trained with reinforcement learning.”

Controls:

↑ / ↓ or W / S

Optional:

difficulty selector

Do not overdesign.

---

# Difficulty levels

If multiple policies/checkpoints work reliably, expose:

Easy
Medium
Hard

Possible implementation:

Easy:
scripted controller or early RL checkpoint

Medium:
intermediate checkpoint

Hard:
best trained policy

Do not artificially slow the final policy merely to create difficulty levels unless necessary.

Another acceptable mechanism is limiting reaction frequency.

---

# Portfolio explanation

Below the game add a concise technical section containing:

## What is happening?

A PPO agent controls the opponent paddle.

## Observation

Display:

ball position
ball velocity
both paddle positions

## Action

up / stay / down

## Reward

+1 score
-1 concede

## Training

Stable-Baselines3 / PyTorch

## Deployment

PyTorch policy → ONNX → ONNX Runtime Web

## Why this is interesting

Inference happens entirely inside the browser.

Keep this explanation concise and technically correct.

---

# Optional visualization

If easy to implement, add a small debug toggle:

Show agent state

When enabled display:

* current observation
* selected action
* action probabilities/logits if available

Example:

ball vx: 0.73
ball vy: -0.31
policy:
↑ 0.09
– 0.12
↓ 0.79

This is a nice portfolio feature but not required for MVP.

---

# Repository organization

Adapt to the existing repository, but aim conceptually for:

project/
│
├── rl/
│   ├── pong_env.py
│   ├── opponents.py
│   ├── train.py
│   ├── evaluate.py
│   ├── export_onnx.py
│   └── constants.py
│
├── tests/
│   ├── test_env.py
│   ├── test_observations.py
│   └── test_onnx_parity.py
│
├── models/
│   └── ...
│
├── assets/
│   └── pong/
│       ├── pong.js
│       ├── pong.css
│       └── pong_policy.onnx
│
└── pong page according to existing Jekyll structure

Do not restructure the rest of the website unnecessarily.

---

# Shared constants

Training/browser mismatch is one of the biggest risks.

Keep all relevant simulation constants explicitly documented.

Create:

rl/constants.py

and corresponding JS constants.

At minimum:

WIDTH
HEIGHT
PADDLE_HEIGHT
PADDLE_SPEED
BALL_SPEED
CONTROL_DT
MAX_BALL_SPEED

Write a test or script comparing exported JSON constants with the JS-side values if useful.

Prefer generating a small:

pong_config.json

from Python and consuming that from JavaScript if this reduces duplication.

---

# Testing requirements

## Python

Environment checker passes.

Unit tests:

* observation always inside observation_space
* actions accepted
* ball-wall collision
* ball-paddle collision
* scoring
* deterministic seed
* normalization bounds

## Model

* trained model loads
* deterministic inference works
* evaluation script runs
* ONNX model loads
* ONNX/SB3 parity test passes

## Browser

Manually or automatically verify:

* page loads from GitHub Pages path
* ONNX asset resolves correctly
* game starts
* keyboard controls work
* restart works
* AI moves
* scoring works
* no console errors
* responsive enough on desktop

Be careful with Jekyll base URLs and GitHub Pages subpaths. Do not assume the website is hosted at `/`.

---

# Acceptance criteria

The MVP is complete only when all of these are true:

1. I can run one command and train a PPO Pong model.
2. I can evaluate it against a scripted opponent.
3. The trained policy clearly beats the easy scripted opponent.
4. The model can be exported to ONNX.
5. ONNX inference matches SB3 deterministic inference.
6. The Pong page works locally.
7. The Pong page works when served with the same path structure as GitHub Pages.
8. I can control one paddle with the keyboard.
9. The RL model controls the opposing paddle.
10. No backend is needed.
11. The browser console has no errors.
12. Existing website pages are unaffected.

---

# Development order

Follow this order strictly:

1. Inspect existing repository and Jekyll structure.
2. Get Pong physics working in Python.
3. Validate Gymnasium environment.
4. Implement scripted opponent.
5. Train PPO baseline.
6. Evaluate PPO baseline.
7. Export ONNX.
8. Validate SB3 ↔ ONNX parity.
9. Build equivalent browser Pong.
10. Integrate ONNX Runtime Web.
11. Verify Python/browser observation normalization.
12. Add polished UI.
13. Deploy/test in GitHub Pages environment.
14. Only then consider self-play/difficulty/checkpoint extras.

Do not build the frontend before confirming the trained and exported policy works.

---

# Scope control

DO:

* reuse Gymnasium
* reuse Stable-Baselines3
* reuse PyTorch
* reuse ONNX Runtime Web
* use state observations
* keep network small
* make training reproducible
* keep browser inference local
* write clean tests

DO NOT:

* implement PPO manually
* use pixel observations
* build a backend
* introduce databases
* introduce React/Vue/etc. just for this
* build a complicated multi-agent framework
* optimize prematurely
* spend time on sophisticated graphics
* add self-play before baseline works

---

# Documentation

Update README with:

## Train

exact commands

## Evaluate

exact commands

## Export

exact commands

## Run website locally

exact commands

## Architecture

brief diagram

Python training
→ PPO
→ ONNX
→ browser inference

Document dependencies and Python version.

Provide a `requirements.txt`, `pyproject.toml`, or equivalent consistent with the existing repository.

---

# Final deliverable report

When implementation is finished, report:

1. files added/modified
2. architecture chosen
3. exact training command
4. training duration/timesteps used
5. evaluation results
6. ONNX parity result
7. exact local website command
8. any remaining limitations
9. suggested next improvements

Do not report the task finished until the playable browser version has actually been tested.
