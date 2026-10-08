# Local development

```bash
docker compose pull
docker compose up

docker compose up jekyll
```

Open the site at:

```text
http://0.0.0.0:8080
```

# Leonardo Maglanoc — personal website

This repository contains Leonardo Maglanoc's personal website and working archive: robotics and AI projects, technical writing, publications, applications, experiments, and interactive browser demos.

The site is built with Jekyll and deployed as a static website. Most of the content is written in Markdown or stored as structured data; the interactive demos run client-side in the browser.

## What is here

- **Projects** — robotics, AI, software, and research project write-ups.
- **Writing** — blog posts, notes, news, and poetry.
- **Academic material** — CV, publications, bibliography, teaching, and profiles.
- **Interactive demos** — browser-based experiments including humanoid locomotion, SLAM, Pong, Flappy Bird, and other small simulations.

The public site is available at [LeoMaglanoc.github.io](https://leomaglanoc.github.io/).

## Repository structure

```text
_pages/                 Main website pages
_projects/              Project narratives
_blogs/                 Blog posts and technical writing
_news/                  News and announcements
_poetry/                Poetry
_bibliography/          Publication records
_data/                  Site and CV data
projects/               Source, tooling and documentation for all side projects
assets/interactive/     Published browser runtime files (generated)
assets/json/            Structured source material
assets/pdf/             PDF documents, including the CV
docs/                   Technical documentation
_layouts/               Page layouts
_includes/              Shared site components
_sass/                  Site styling
_plugins/               Jekyll plugins and build helpers
```

## Useful commands

Build the site once:

```bash
docker compose run --rm jekyll bundle exec jekyll build
```

Build, test, and serve the deployed SLAM route locally (uses only Docker
containers and mirrors the GitHub Pages publish layout):

```bash
./scripts/preview-slam.sh
```

Open [http://localhost:8080/slam/](http://localhost:8080/slam/). Use
`./scripts/preview-slam.sh --build-only` when you only need the generated
`_site/slam/` files. This preview owns port 8080, so stop `jekyll` first if it
is already running.

Run the G1 browser demo directly, without the Jekyll shell:

```bash
docker compose -f projects/g1/docker-compose.yml up g1-site
```

Open [http://localhost:8000/assets/interactive/g1/](http://localhost:8000/assets/interactive/g1/).

The G1 policy/model contract tests run in the reproducible tools container:

```bash
docker compose -f projects/g1/docker-compose.yml run --rm g1-tools \
  python -m unittest discover -s projects/g1/tests -p 'test_*.py'
```

The main site route for the G1 playground is [/g1/](https://leomaglanoc.github.io/g1/). It uses a fullscreen layout and embeds the static simulator from `projects/g1/`.

## Interactive Web Demos

Small interactive experiments built with coding agents:
[**Humanoid Walking**](https://leonardo-maglanoc.com/locomotion/) ·
[**Dexterous Cube Orientation**](https://leonardo-maglanoc.com/dexterous-rl/) ·
[**EuroGuesser AI**](https://leonardo-maglanoc.com/euroguessr/) ·
[**BlockTemple**](https://leonardo-maglanoc.com/block-temple/).

These notes explain the training, runtime architecture, and engineering tradeoffs
for a technical interview. All four demos execute locally in the browser after
loading static assets. Training and asset authoring happen offline.

| Demo                       | Learning / algorithm                                                           | Model provenance                                                                  | Browser runtime                           |
| -------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- | ----------------------------------------- |
| Humanoid Walking           | Recurrent PPO policy + joint PD control                                        | Released Unitree actor; exported here, no local retraining                        | ONNX Runtime Web + MuJoCo WASM + Three.js |
| Dexterous Cube Orientation | PPO policy with observation history + filtered joint targets                   | Released Wuji Hand 1 actor; no local retraining                                   | ONNX Runtime Web + MuJoCo WASM + Three.js |
| EuroGuesser AI             | Supervised geographic classification + GeoCLIP distillation + visual retrieval | MobileNet student trained here from pretrained weights; optional released GeoCLIP | ONNX Runtime Web/WASM in a CPU worker     |
| BlockTemple                | Procedural mesh authoring, voxel traversal, collision queries                  | No machine-learning model                                                         | Godot web export + WebGL                  |

### 1. Humanoid Walking

[Open demo](https://leonardo-maglanoc.com/locomotion/) ·
[Implementation and reproduction](projects/g1/README.md) ·
[Public playground wrapper](projects/locomotion-playground/README.md)

**Task and model.** A Unitree G1 follows forward, lateral, and yaw velocity
commands using 12 leg joints. The deployed actor is Unitree's released
`unitree_rl_gym/deploy/pre_train/g1/motion.pt`. The exporter reconstructs its
47-input, 64-unit LSTM and `64 -> 32 -> 12` action head with an ELU activation.
It exports the hidden and cell states explicitly, so JavaScript carries the
recurrent memory between decisions and clears it on reset.

**How training relates to this project.** The upstream policy uses PPO
(Proximal Policy Optimization). In PPO, an actor collects simulated trajectories;
a critic estimates future discounted reward; advantage estimates tell the actor
which actions performed better than expected. Updates optimize a clipped
probability-ratio objective to discourage overly large policy changes. The
critic is needed for training, while deployment only needs the actor. This is
the algorithmic training pattern, not a reconstruction of this checkpoint's
original run: this project retains the released actor and deployment contract,
but does not establish its exact reward weights, randomization schedule,
training duration, or original learning curves. The work here is browser
integration, recurrent ONNX export, control-contract reproduction, and validation.

```text
Upstream training (PPO; original run details not recorded here)
  simulated trajectories -> reward + critic -> advantage estimates
           ^                                      |
           +------------- updated actor <---------+
                              |
                    released motion.pt
                              v
Local offline: explicit LSTM-state export -> ONNX numerical parity -> static assets

Browser (all rates are per simulated second)
  keyboard / touch -> command [vx, vy, yaw rate]
                              |
  MuJoCo state + previous action + gait phase
                              |
                              v
                       47-D observation
                              |
  hidden, cell ------> LSTM actor @ 50 Hz ------> next hidden, cell
                              |
                         12 actions
                              v
                   q_target = q_default + 0.25 * action
                              |
                              v
            PD @ 500 Hz: torque = Kp*(q_target - q) - Kd*dq
                              |
                              v
                 MuJoCo WASM (10 steps / action)
                     |                     |
                     +-> next state        +-> Three.js rendering
```

**What the policy sees.** The 47 values are angular velocity (3), projected
gravity (3), velocity command (3), joint-position offsets (12), joint velocities
(12), previous action (12), and sine/cosine of gait phase (2). Scaling, joint
order, default angles, and a 0.8-second phase period match the deployment code.
The observation has no camera or terrain-height map. The actor outputs joint
position offsets; the fast PD loop turns these into torques, and MuJoCo computes
contacts and the next physical state. Push buttons apply a physical pelvis force.

**Interview discussion.** The slow learned controller chooses coordinated leg
motion, while the fast PD controller supplies joint tracking between decisions.
The LSTM preserves temporal information beyond one observation. Export checks
compare TorchScript, reconstructed PyTorch, and ONNX outputs and recurrent states
across sequential inputs with a maximum absolute error threshold of `1e-5`.
Matching the observation/action contract is essential; it does not establish
identical long-horizon physics across browsers or real-robot transfer. The public
`/locomotion/` wrapper currently exposes G1 only; the retained B2 MPC experiments
are separate from this demo.

### 2. Dexterous Cube Orientation

[Open demo](https://leonardo-maglanoc.com/dexterous-rl/) ·
[Implementation and reproduction](projects/dexterous-rl/README.md) ·
[Measured validation](projects/dexterous-rl/VALIDATION.md)

**Task and model.** A 20-joint Wuji Hand 1 rotates a free 54 mm, 120 g cube toward
a target orientation through simulated contact and friction. It deploys Wuji
Technology's released `WujiHand_Reorient` actor directly. No new policy was
trained or distilled here. The target is a quaternion; the actor receives its
orientation error as a continuous six-dimensional rotation representation.

**How the upstream model is trained.** The pinned upstream release configuration
uses mjlab/RSL-RL PPO with 8,192 parallel environments, 40 rollout steps per
environment per iteration, and a configured 5,000 iterations. These are release
configuration values, not a newly measured training run. The actor MLP has
`512 -> 256 -> 128` hidden units with ELU; the critic has
`512 -> 512 -> 256 -> 128`. Training uses learned observation normalization and
a Gaussian action distribution for exploration. PPO uses a clipping parameter of
0.2, learning rate `1e-4`, four learning epochs, 32 minibatches, discount 0.99,
and GAE lambda 0.95. GAE (generalized advantage estimation) combines reward and
value predictions over time to estimate action advantages.

The task config wires orientation rewards, terminations, a curriculum,
observation corruption, and physical randomization, including object mass/size,
friction/contact parameters, actuator gains, and disturbances. These variations
expose the policy to more than one idealized simulator condition; they are
removed in the upstream play configuration used for evaluation. The exported
actor includes its learned observation processing; adding a second normalizer
would change its behavior. The local CPU tooling reproduces evaluation/export,
not GPU PPO training.

```text
Upstream offline training
  parallel randomized hand/cube simulations
       -> observations + sampled actions + rewards
       -> critic / GAE -> clipped PPO actor + value updates
       -> released checkpoint + normalized ONNX actor + config
                                      |
Local preparation                     v
  official scene + observation builder -> native traces / golden vectors
                                      |
                                      v
Browser
  target orientation + MuJoCo hand/cube state + previous raw action
                                      |
                         three-frame observation history
                                      |
                               207-D input
                                      v
                          PPO actor @ 20 Hz -> 20 actions
                                      |
          clamp [-1,1] -> scale 0.5 -> add grasp -> soft-limit clamp
                                      |
                   EMA: target = 0.5*new + 0.5*previous
                                      |
                    joint position actuators + contact physics
                       MuJoCo WASM @ 100 Hz (5 steps / action)
                            |                         |
                            +-> next observation      +-> Three.js
```

**What the policy sees.** Each frame has 20 normalized joint positions, 20
tracking errors relative to the previous filtered joint target, 3 cube-position
coordinates in the wrist-tag frame, 6 orientation-error values, and 20 previous
raw actions: 69 values, with three-frame histories concatenated per observation
term to make 207. The tracking errors are position differences, not velocities.
Initial history is filled with the first frame; the first 0.4 simulated seconds
use the official grasp. Changing the target changes the observation while the
same policy continues controlling the hand. Cube pose comes from simulator state;
this demo does not implement camera-based object tracking.

**Interview discussion.** Contact-rich manipulation is sensitive to joint order,
normalization, action filtering, collision geometry, and solver settings. Native
and browser MuJoCo are pinned to 3.11.0. Ten frozen vectors check observations,
actions, filtered targets, and one control interval of physics; the demo checks
actor parity on startup. Recorded browser regression reached and held all 12
seeded fixed goals with no drops, using error below 0.2 rad for five policy steps.
That is limited regression evidence, not a population success-rate estimate.
A dropped cube stops simulation visibly. The contribution here is faithful
browser deployment and validation of an upstream learned controller.

### 3. EuroGuesser AI

[Open demo](https://leonardo-maglanoc.com/euroguessr/) ·
[Implementation and reproduction](projects/euroguessr/README.md) ·
[Training methodology](projects/euroguessr/RESEARCH_V2.md) ·
[Shipped model metadata](projects/euroguessr/models/metadata.json)

**Task and data.** Predict latitude/longitude from a European street photograph.
The game presents five untimed rounds against the model. Research images come
from a pinned OSV-5M revision with country balancing and sequence deduplication.
The V2 manifest has 8,500 training, 961 validation, and 363 fresh-test images.
Hashed 3-degree spatial blocks and a minimum 25 km training/holdout buffer reduce
nearby-image leakage; the fresh holdouts also avoid preserved V1 training
neighbors. This is a custom European experiment, not the full OSV-5M benchmark.

**How the default Tiny model is trained.** Start from ImageNet-pretrained
MobileNetV3-Small, warm-start compatible encoder weights from V1, and derive
96 geographic cells from training GPS only. A classification head predicts the
nearest cell; a `576 -> 512` projection maps image features into GeoCLIP's
embedding space. Cache the frozen encoder prefix to make CPU training practical,
train the heads, then fine-tune the final two encoder blocks. AdamW updates the
trainable parameters. The selected FP32 student has 1,394,816 parameters.

A pretrained GeoCLIP teacher supplies soft geographic targets and normalized
image embeddings for 5,000 covered training images. The selected objective is
`0.5 * geographic CE + 0.2 * distillation KL + 0.3 * embedding loss`.
CE is class-weighted cross-entropy with 0.1 label smoothing; KL matches the
teacher's softened cell probabilities with temperature scaling; embedding loss
is `1 - cosine_similarity(student_projection, teacher_embedding)`.
Teacher terms are masked out for uncovered examples. The teacher itself is not
trained here. Its upstream training overlap with evaluation imagery cannot be
independently ruled out.

```text
Offline (Docker, CPU)
  OSV-5M photos + GPS -> spatial / sequence split
                            |
                   training-only geographic cells
                            |
       +--------------------+-------------------------+
       |                                              |
  MobileNet image features                 pretrained GeoCLIP teacher
       |                                     cached soft cells + embeddings
       +-> cell head + 512-D projection <--------------+
                            |
                  CE + KL + cosine losses
                            |
                heads -> final-block fine-tuning
                            |
       validation selects checkpoint + prediction method
                            |
             locked fresh-test evaluation -> FP32 ONNX
                            +-> training-reference embedding/GPS index

Browser (worker receives pixels + token, never answer GPS or photo ID)
  photo -> matched 224x224 preprocessing -> ONNX MobileNet student
                            |
                  normalized 512-D projection
                            |
          cosine similarity to training-reference embeddings
                            |
          top 50 -> exp(10 * similarity) normalized weights
                            |
                 weighted reference latitude/longitude
                            |
       AI guess + player pin -> great-circle distance -> round score
```

**Why retrieval follows classification training.** The classifier teaches
geographic structure, but validation compares its cell predictions with several
retrieval strategies. The deployed method is `distilled-50-t10`: retrieve the
50 closest projected training embeddings and average their GPS with exponential
similarity weights. Subtracting the best similarity before exponentiation keeps
the calculation stable without changing the normalized weights. No test-photo
answers enter the retrieval index. The result is a similarity-weighted location
estimate; it can fall between distant plausible locations.

**Results and optional model.** On the same spatial validation cohort, median
error was 833 km for preserved V1, 754 km for supervised V2, and 724 km for the
selected distilled V2; the separate fresh-test median for the selected model was
771 km. The optional GeoCLIP mode runs the released image encoder against an
independent regular GPS gallery, achieving 372 km fresh-test median error. Its
approximately 320 MiB download stores linear weights in 8-bit form while using
FP32 arithmetic; it is explicitly opt-in and can take seconds or tens of seconds
per photo. Both paths run in a single-thread CPU worker with no inference API.

**Interview discussion.** Distillation transfers a larger model's representation
into a smaller deployable model. Spatial splitting matters because neighboring
street frames can make random image splits misleading. Validation chooses the
checkpoint and retrieval settings before the fresh test is inspected. Matched
Python/JavaScript preprocessing and ONNX parity guard deployment correctness.
Median geographic error measures localization accuracy; human win rate remains
unmeasured. The offline map uses local assets, and scores are
`round(5000 * exp(-distance_km / 1500))` per round.

### 4. BlockTemple

[Open demo](https://leonardo-maglanoc.com/block-temple/) ·
[Implementation and reproduction](projects/block-temple/README.md) ·
[World algorithms](projects/block-temple/godot/scripts/world.gd) ·
[Controller and interactions](projects/block-temple/godot/scripts/game.gd)

**Task and authoring.** Explore an intact Coruscant temple reconstruction, discover
a service annex, mine recovered blocks, and build a route to an overlook.
There is no trained model or RL agent. Python scripts generate a repeatable
Blender module kit and room layout from visual references; dimensions and unseen
spaces are inferred. Geometry is batched by room/material, exported to GLB with
separate collision meshes, and imported into Godot for a static web export.
This combines fixed authored architecture with an editable voxel construction
area. Coding agents assisted implementation; they do not run inside the game.

```text
Offline asset pipeline
  screenshots / map / walkthrough
       -> Python procedural Blender kit + layout
       -> editable .blend + separate collision geometry
       -> scene validation + fixed inspection renders
       -> GLB + layout.json -> Godot import / mechanics checks -> web export

Browser gameplay loop
  keyboard / mouse / independent touch pointers
       -> Godot player motion + camera + collision / stair stepping
       -> aim ray
            +-> voxel DDA traversal --------+
            +-> static architecture raycast +-> closest hit
                                                   |
                                     mining / placement validation
                                                   |
                        inventory + voxel edit + progression update
                                                   |
                   mark affected chunks -> exposed-face mesh / collision rebuild
                                                   |
                       room visibility + baked shading -> WebGL frame

Persistence
  base voxel world + validated saved deltas -> current world
  edits + player pose + inventory + discoveries -> browser local storage
```

**How the algorithms work.** Voxel storage uses a packed byte array. Chunks span
16 by 16 cells horizontally; meshes emit only faces adjacent to empty space,
avoiding hidden internal faces. An edit marks affected chunks, including relevant
neighbors, for rebuilding. DDA (digital differential analyzer) advances the aim
ray to the next grid boundary on each axis, testing cells in traversal order
instead of testing every block. A separate physics raycast checks permanent
architecture; the nearest hit wins so the player cannot mine through a wall.
Placement checks construction bounds, inventory, and overlap with the player
and fixed geometry. Permanent architecture cannot be mined.

**Interview discussion.** Fixed architecture benefits from authored meshes and
batched rendering; editable regions benefit from voxel indexing and local
rebuilds. Room visibility keeps adjacent portal regions visible, baked vertex
shading avoids costly live lighting, and resolution caps reduce browser GPU
load. Delta saves store changes relative to the base world, plus player and game
state, under the isolated `coruscant-temple-v2` storage key. Loading rejects
invalid cells and recovers unsafe player positions. Validation covers mechanics,
collision/targeting, placement, touch pointer independence, and save isolation.
The technical story is asset reproducibility, interaction correctness, and web
performance; no model-training claim applies.

## Other interactive experiments

The repository also retains the following experiments beyond the four featured
website demos.

### Endless mobile manipulation

The [/mobile-sorting/](https://leomaglanoc.github.io/mobile-sorting/) demo runs a
TIAGo mobile manipulator sorting randomized blue/red boxes into matching bins.
Analytic top-down grasps, Cartesian inverse kinematics, smooth arm references,
wheel-driven differential navigation and a recovery state machine execute in
MuJoCo WASM. The fingers retain objects through contact and friction; there is
no grasp attachment, learning, camera perception or backend. A fixed five-body
object pool supports continuous operation. All runtime assets are local.

Desktop and mobile layouts support orbit/pinch, pause, reset and fullscreen.
See [`projects/mobile-sorting/README.md`](projects/mobile-sorting/README.md)
for Docker commands, controller details, model modifications and validation.

### TinyDreamer CartPole

The [/tiny-dreamer/](https://leomaglanoc.github.io/tiny-dreamer/) demo uses a small
Dreamer-inspired agent to swing up and balance DeepMind Control Suite's native
CartPole. It learns from five state observations with no handcrafted controller
or imitation teacher. The actor and a recurrent world model run locally in the
browser alongside MuJoCo WASM physics.

**Algorithm.** CPU training in Docker alternates real experience collection and
neural imagination. Replay sequences train an encoder, recurrent state-space
model (RSSM), observation decoder, reward head, and continuation head using
reconstruction, prediction, and balanced KL losses. Posterior beliefs seed
imagined trajectories through the learned prior. An actor maximizes bootstrapped
lambda returns through the frozen world model; a critic learns their values.
The final stage uses 30-decision imagination. Validation selects the checkpoint,
and separate held-out episodes measure its performance before ONNX export.

**System pipeline:**

```text
Offline (Docker, CPU)
native MuJoCo experience → episode replay → encoder + RSSM + prediction heads
    → imagined actor rollouts → lambda returns → actor + critic updates
    → more real experience → validation / held-out evaluation
    → ONNX export + numerical parity → static model assets

Browser control (20 decisions per simulated second)
MuJoCo WASM observation + previous action + recurrent belief
    → posterior.onnx → corrected belief → actor.onnx → bounded motor action
    → 5 × 10 ms physics controls → next observation → repeat

Browser dream visualization (refreshed every 0.5 simulated seconds)
copied belief → actor.onnx + rssm.onnx prior → 15 decoded future observations
    → Canvas ghost poses up to 0.75 seconds ahead
```

Push buttons apply a separate physical force. The world model receives the
resulting observations and corrects its belief, making forecast divergence and
recovery visible. The dreams are neural predictions; the actor supplies control
directly without runtime planning. ONNX Runtime Web, physics, and rendering use
local static assets with no backend or runtime CDN dependency.

The trained agent succeeded on **20/20 held-out swing-up episodes**, with mean
return **753.19**, compared with **122.88** for random actions. Strong pushes can
break sustained balance. See [`projects/tiny-dreamer/README.md`](projects/tiny-dreamer/README.md)
for the detailed algorithm, training commands, contracts, validation, and limits.

### FPV drone racing

The [/drone-racing/](https://leomaglanoc.github.io/drone-racing/) demo flies an approximate 650 g FPV quad around a closed ten-gate circuit:

```text
periodic racing trajectory
      ↓
tracking MPC (25 Hz) → desired acceleration
      ↓
geometric flight controller (125 Hz) → thrust and torque
      ↓
motor mixer → first-order motor response
      ↓
MuJoCo WASM physics (250 Hz)
      ↓
Three.js rendering → chase / FPV view
```

Autopilot continuously wraps the reference trajectory without resetting the vehicle. Manual flight replaces MPC with assisted velocity commands and banked steering, using keyboard or dual touch sticks. Directional push buttons apply brief physical forces so the controller's deviation and recovery are visible. Ordered gate crossings track laps and best times; Race AI replays a looping recorded physics rollout. Everything runs locally in the browser with WebGL and no backend. The vehicle is an illustrative model, not a calibrated digital twin.

See [`projects/drone-racing/README.md`](projects/drone-racing/README.md) for parameters, controls, validation and limitations.

### Panda drawing & repair

The [/painter/](https://leomaglanoc.github.io/painter/) demo lets you draw ordered strokes, watch a Franka Panda reproduce them, then erase and repair its output:

```text
reference strokes → resampling → marker-tip IK → joint targets
      ↓
Panda actuators → MuJoCo WASM physics → actual marker-tip motion
      ↓
CURRENT ink raster + physical board texture
      ↓
erase ink → directional missing-stroke detection
      ↓
overlapping repair runs → nearest-endpoint ordering → IK → redraw
      ↓
observe again → complete or report stalled repair
```

CURRENT records actual simulated motion. Detection tolerates sideways tracking error while preserving gaps along a stroke. Manual repair and a two-second auto-repair countdown redraw missing regions; erasing during repair cancels the active plan and replans from the current robot pose. Pointer/touch controls, Canvas, Three.js, and MuJoCo run locally in the browser with no backend or WebGPU requirement.

See [`projects/painter/README.md`](projects/painter/README.md) for implementation details, validation, limitations, and attribution.

All demos are organized as self-contained projects under [`projects/`](projects/). Each demo's local README or Docker configuration is the source of truth for its own commands.

## Editing the site

For normal content changes:

1. Add or edit Markdown in the relevant content directory.
2. Keep dates, titles, roles, project details, and technical claims consistent with the structured source material.
3. Add or update assets under `assets/` when needed.
4. Build the site locally before pushing.

For browser demos, edit source, assets, tests, and documentation in `projects/<name>/`. Run `python3 scripts/publish-project-assets.py` before previewing or building the website. `assets/interactive/` and `assets/js/ask-leo/` contain generated runtime copies; keep their URLs stable.

## CI and deployment

GitHub Actions builds the Jekyll site, runs the repository's checks, and publishes the generated static site. The workflow definitions are in [`.github/workflows/`](.github/workflows/).

## Attribution

Third-party libraries and assets are documented in the relevant notices files, including [`projects/g1/THIRD_PARTY_NOTICES.md`](projects/g1/THIRD_PARTY_NOTICES.md). The repository also retains the project license in [`LICENSE`](LICENSE).

## Side-project development

All side-project source lives under `projects/`; `_projects/` contains the
website write-ups. See [projects/README.md](projects/README.md) for build and
publication details. Before a local Jekyll build or static preview, run:

```sh
python3 scripts/publish-project-assets.py
```

CI performs this step automatically. Godot exports remain checked in at their
existing public paths and are rebuilt using each game's `scripts/build_web.sh`.
SLAM is built separately from `projects/slam/web/` and published at `/slam/`.
LLM city guard is source-only and is excluded from the site.
