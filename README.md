# Interactive Web Demos

This is Leonardo Maglanoc's personal website and working archive of robotics,
AI, technical writing, publications, and browser experiments. The four featured
demos below run inference, control/search, and rendering on the visitor's device.
Training and model preparation happen offline; GitHub Pages serves static files.

[Live website](https://leonardo-maglanoc.com/) ·
[GitHub Pages address](https://leomaglanoc.github.io/) ·
[All demos in the blog](https://leonardo-maglanoc.com/blog/AI-coding-agent-case-study/)

## Demo Overview

| Featured demo                                                             | Algorithm and model                                                          | Training provenance                                                           | Browser execution                                              |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------- |
| [G1 Parkour](https://leonardo-maglanoc.com/parkour/) | Depth encoder + 140-input student → 29 actions; joint PD control | Released PHP depth/student pair; no local retraining | ONNX Runtime Web CPU/WASM, MuJoCo WASM, Three.js depth/rendering |
| [Dexterous Cube Orientation](https://leonardo-maglanoc.com/dexterous-rl/) | 207 observations → 20 hand actions; filtered joint targets                   | Released Wuji Hand 1 PPO actor; no local training or distillation             | ONNX Runtime Web CPU/WASM, MuJoCo 3.11.0 WASM, Three.js        |
| [EuroGuesser AI](https://leonardo-maglanoc.com/euroguessr/)               | MobileNetV3-Small geographic student + embedding retrieval; optional GeoCLIP | Local OSV-5M supervision/distillation from pretrained ImageNet/GeoCLIP models | Single-thread ONNX Runtime Web/WASM in a CPU Worker; local map |
| [RustZero](https://leonardo-maglanoc.com/rustzero/)                       | Small policy/value MLP + PUCT for 6×6 Breakthrough                           | Local CPU self-play from random initialization                                | Rust/Burn Flex f32 compiled to WASM in a Worker; JavaScript UI |

These are different systems: the robotics actors choose controls for physical
simulation, EuroGuesser retrieves geographic coordinates, and RustZero searches
a discrete game tree. None trains a neural network during browser play.
[The source audit](docs/featured-demo-evidence.md) maps claims to implementation
and saved artifacts. Project READMEs retain detailed reproduction instructions.

## 1. G1 Parkour

### Overview

Steer a 29-joint Unitree G1 through a colored obstacle course in live MuJoCo
physics. The released Perceptive Humanoid Parkour (PHP) policy uses simulated
onboard depth and proprioception to choose joint actions. Keyboard or held touch
buttons select a direction and LOW/HIGH speed mode; the policy supplies the
motion. Orbit the camera, inspect the processed depth preview, pause, or reset
to the start. Shift+mouse dragging applies a physical disturbance.

This website adapts the researchers' released browser demonstration. **No local
policy training or retraining was performed.** Robot motion comes from neural
inference, joint control, contacts and gravity. The display camera can move
independently of the torso-mounted depth sensor used by the policy.

### System Architecture

```text
Upstream offline learning (not reproduced here)
  retargeted human skills -> motion matching -> long motion/terrain sequences
      -> privileged RL tracking teachers -> depth student (DAgger + RL)
      -> released student.onnx + depth_backbone.onnx

Browser feedback loop (rates per simulated second)
  keyboard / touch -> direction + speed -> 15-D one-hot command ------+
                                                                    |
  MuJoCo robot/course -> torso depth camera @ 10 Hz                   |
       |                 106x60 -> crop -> bicubic 87x58              |
       |                 -> normalize -> depth_backbone.onnx         |
       |                 -> 32-D latent -> seven-control-step delay   |
       |                                                |           |
       +-> previous action + angular velocity + joint state + gravity
       |                                                |           |
       |                                          [1,140] student input
       |                                                v
       |                                     student.onnx @ 50 Hz
       |                                                |
       |                              29 actions -> named joint targets
       |                                                |
       +-- MuJoCo @ 500 Hz <- per-joint PD torques <------+
                 |
                 +-> body transforms -> Three.js display + status/depth UI
```

### Subsystem Inputs and Outputs

| Subsystem | Input | Processing | Output | Implementation |
| --- | --- | --- | --- | --- |
| Commands | Six direction buttons or W/A/Q/D/E/S; LOW/HIGH | Map held direction and mode into the released command indices | 15-D one-hot command | [interface.js](projects/g1-parkour/src/interface.js) |
| Depth camera | Torso pose and sensor-visible terrain/robot geometry | Render metric depth with the retained camera and clipping range | 106×60 float depth image | [main.js](projects/g1-parkour/src/main.js) |
| Preprocessing | Rendered depth pixels | Row orientation, crop, clip, antialiased bicubic resize and normalization | 87×58 processed depth | [releaseContract.js](projects/g1-parkour/src/policy/releaseContract.js) |
| Depth backbone | Processed depth | Released ONNX inference, queued latency | 32-D latent | [policyController.js](projects/g1-parkour/src/policy/policyController.js) |
| Student actor | Previous actions, base angular velocity, joint position/velocity, gravity, command and depth latent | Concatenate in verified release order; ONNX inference | 29 joint actions | [policyController.js](projects/g1-parkour/src/policy/policyController.js) |
| Servo/physics | Actions and MuJoCo joint state | Metadata-defined target offsets and gains; name-mapped PD torque | Updated robot state and contacts | [policyController.js](projects/g1-parkour/src/policy/policyController.js), [mujocoUtils.js](projects/g1-parkour/src/mujocoUtils.js) |
| Display/lifecycle | Body poses, user camera gestures and status | Independent display camera, pause, serialized reset, depth preview | Interactive scene and telemetry | [main.js](projects/g1-parkour/src/main.js), [interface.js](projects/g1-parkour/src/interface.js) |

### Observation, Perception and Control Algorithm

The student consumes **140 values** in this exact order: previous actions (29),
base angular velocity (3), joint position (29), joint velocity (29), torso
projected gravity (3), direction/speed command (15), and depth latent (32).
The implementation follows the released Holosoma inference preset. An older
observation descriptor embedded in the export is descriptive and does not define
this concatenation order. Joint/actuator mappings are resolved by name.

The simulated D435i camera has a 106×60 image, 89.5° horizontal field of view,
and 0.3–3 m range. Readback is converted to top-down rows, cropped by two rows
at the top and four columns on each side, then resized to 87×58 with separable
antialiased bicubic interpolation. The release's invalid-value handling,
clipping and normalization are retained; ordinary depth values are mapped as
`(depth - 0.3) / (3.0 - 0.3) - 0.5`. The depth encoder produces 32 values.
A seven-control-step delay preserves approximately 140 ms of simulated latency;
the actor receives the queued latent rather than an instantly updated sensor.

Command indices are idle 0; LOW W/A/Q/D/E map to 1/2/3/4/5; HIGH maps to
6/7/8/9/10. S maps to 11 in either mode. These select headings, including
45° and 90° directions. The learned controller interprets them; the buttons
are not direct joint controls or lateral velocity sliders.

For joint i, the controller uses model metadata for each default position,
action scale, stiffness and damping:

```text
q_target[i] = q_default[i] + action_scale[i] * action[i]
torque[i]   = Kp[i] * (q_target[i] - q[i]) - Kd[i] * dq[i]
```

MuJoCo advances in 0.002 s steps. The actor runs every ten steps (50 Hz), while
depth updates every fifty steps (10 Hz). These rates are defined in simulation
time. The non-convex collision course is split into the original 13 connected
components; the visual finish gate is excluded from collision and sensor depth.
Finish status requires reaching the gate corridor, not merely passing its x
coordinate after drifting away from the course.

### Training Pipeline and Provenance

The researchers' [PHP repository](https://github.com/amazon-far/php_parkour)
describes three stages: motion matching composes retargeted human skills into
long trajectories; reinforcement-learning teachers track those trajectories
with privileged state/terrain observations; DAgger and RL distill teachers into
a depth-based multi-skill student. The browser executes the exported student
and depth encoder. It does not execute motion matching, teacher inference,
training rollouts, dataset aggregation or optimizer updates.

Motion references guide teacher tracking; reinforcement-learning rewards guide
policy improvement. In the student stage, teacher actions provide imitation
supervision on visited states and RL adds task feedback. This is the published
method summary, **not a recovered record of the exact released training run**.
Original rollout datasets, checkpoint-specific reward weights, optimizer state,
learning curves and training hardware are not retained here; an exact training
loss or resumable state cannot be inferred from the exported graphs.

The immutable [released pair](projects/g1-parkour/public/php-release/manifest.json)
is `student.onnx` (13,841,549 bytes) and `depth_backbone.onnx` (105,240 bytes).
Their SHA-256 checksums match the official `student-assets-v1` manifest. Source,
release and terrain revisions are recorded in
[upstream.json](projects/g1-parkour/upstream.json); the npm lockfile, native
fixtures and complete scene assets preserve the integration inputs.

[CHECKPOINTS.md](projects/g1-parkour/CHECKPOINTS.md) records the baseline and
validated Git tags, model hashes, terrain regeneration and future experiment
requirements. These are inference/source checkpoints. The official release
contains no raw teacher/student training or optimizer checkpoint. Continuing
training requires obtaining a real checkpoint and configuration, or beginning
a new documented run with saved optimizer, RNG, data and environment state.

### Runtime, Deployment and Reproduction

[Source and Docker instructions](projects/g1-parkour/README.md) live in the
isolated `projects/g1-parkour/` app. Vite builds the runtime into
`assets/interactive/g1-parkour/`, and `/parkour/` embeds it with the site's
fullscreen layout. MuJoCo WASM supplies physics, ONNX Runtime Web uses a
single-thread CPU/WASM execution provider, and Three.js supplies WebGL display
and sensor rendering. All runtime files are served statically, with no inference
backend, account, WebGPU or runtime CDN requirement. WebGL2 and floating-point
depth rendering/readback are required; unsupported GPUs get a startup message.

```sh
docker compose -f projects/g1-parkour/compose.yaml run --rm tools
docker compose -f projects/g1-parkour/compose.yaml up -d preview
# Open http://127.0.0.1:8096/assets/interactive/g1-parkour/index.html

docker build -f projects/g1-parkour/Dockerfile.browser \
  -t g1-parkour-browser:2026-10-09 projects/g1-parkour
docker run --rm --network host -v "$PWD":/work g1-parkour-browser:2026-10-09
```

Reset is serialized after pending inference, returns the robot to the start,
clears action/depth/held-command state, and reuses the existing models and scene.
Backgrounding pauses the simulation and clears controls. Slow frames advance
less simulated time while retaining the physics and policy step cadence.
The display uses simpler materials and no decorative shadows; the separate
sensor layer retains the original geometry and depth behavior.

### Validation, Limitations and References

[Validation](projects/g1-parkour/VALIDATION.md) records Docker contract checks,
Chrome desktop/portrait/landscape controls, touch orbit/pinch, reset resource
reuse and the normal/unsupported-GPU startup paths. Fixtures verify all 29
mappings, command codes, PD targets and the 140-D input. Native action maximum
error is 1.49e-7; depth preprocessing maximum error is 6.7353e-6 against a 1e-5
tolerance. Simplified display materials produced zero change in the tested
raw sensor pixels. These checks establish numerical contracts, not identical
long-horizon native/browser trajectories or safe physical robot deployment.

A fixed HIGH-forward rollout cleared the first four obstacles, then drifted off
the course. Manual traversal of the entire course remains unverified. The
simulation can fall; no automatic steering or scripted recovery replaces the
policy. Software-rendered full-view tests were slow, and foreground hardware
acceleration and physical-phone performance remain unmeasured. Phone screenshots
are Chrome viewport/touch emulation, not measurements from a physical device.

The [third-party notices](projects/g1-parkour/public/THIRD_PARTY_NOTICES.md)
record browser/research/robot/engine licenses and gaps in model-specific and
later-contributor license statements. Retaining source provenance and checksums
does not imply an additional license grant. See the
[released student assets](https://github.com/amazon-far/php_parkour/releases/tag/student-assets-v1)
and [pinned browser source](https://github.com/php-parkour/php-parkour.github.io/tree/3898564255525f2a72dbbfb1d190b48a230435ab)
for the upstream implementation.

## 2. Dexterous Cube Orientation

### Overview

A fixed 20-joint Wuji Hand 1 manipulates a free 54 mm, 120 g cube through MuJoCo
contact and friction. Rotate the translucent target or choose a random orientation;
the released policy acts on the changing goal. The target overlay is visual;
the held cube is a physical free body. No camera-based tracking is implemented.

### System Architecture

```text
Upstream offline training (release configuration, not local retraining)
  randomized hand/cube environments + goal commands
      -> observations / sampled actions / rewards -> critic + GAE
      -> PPO actor/value/entropy updates -> released model.pt + policy.onnx

Online feedback loop
  target quaternion (world w,x,y,z) ----------------------------+
                                                               v
  MuJoCo joint/cube state -> wrist-relative position + rotation error
       ^                          + prior target / action       |
       |                                                       v
       |                       term-major 3-frame history [1,207]
       |                                                       |
       |                                  normalized actor @ 20 Hz
       |                                                       v
       |                           20 raw actions -> clamp [-1,1]
       |                           -> grasp + 0.5 * action
       |                           -> soft limits -> EMA alpha 0.5
       |                                                       |
       +-- MuJoCo contact physics @ 100 Hz <- position actuators+
                  |
                  +-> Three.js physical hand/cube + target overlay
```

### Subsystem Inputs and Outputs

| Subsystem        | Input                                                                             | Processing                                                                           | Output                                  | Implementation                                                                                                                                                                      |
| ---------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Goal             | Drag, arrow keys, random button                                                   | Continuous rotation or uniform SO(3) sample                                          | Unit quaternion w,x,y,z in world frame  | [scene-overlay.js](projects/dexterous-rl/web/scene-overlay.js), [control.js](projects/dexterous-rl/web/control.js)                                                                  |
| Observation      | Joint angles, prior filtered target, wrist tag, cube pose, goal, prior raw action | Soft-limit normalization, wrist transform, orientation encoding, three-frame buffers | Float32 `[1,207]`                       | [control.js](projects/dexterous-rl/web/control.js), [config.json](projects/dexterous-rl/web/config.json)                                                                            |
| Policy           | 207 observations                                                                  | Released normalized MLP, hidden 512 → 256 → 128 ELU                                  | 20 raw joint actions                    | [policy.js](projects/dexterous-rl/web/policy.js), [release config](projects/dexterous-rl/checkpoints/reference-source/src/wuji_mjlab/tasks/reorient/config/wuji_hand/rsl_rl/ppo.py) |
| Actuation        | Raw action, previous target, policy step                                          | Clamp, scale, grasp offset, soft-limit clamp, EMA; 0.4 s grasp warmup                | 20 absolute position targets (rad)      | [applyAction](projects/dexterous-rl/web/control.js)                                                                                                                                 |
| Physics/feedback | Joint targets, free cube, contact geometry                                        | Five 0.01 s steps/control interval; drop/hold checks                                 | Updated state, angular error and status | [app.js](projects/dexterous-rl/web/app.js), [scene.xml](projects/dexterous-rl/web/scene.xml)                                                                                        |
| Rendering        | MuJoCo visual scene, target                                                       | Shared scene renderer plus target overlay                                            | WebGL frame                             | [scene-overlay.js](projects/dexterous-rl/web/scene-overlay.js)                                                                                                                      |

### Control / Learning Algorithm

Each 69-value frame contains normalized joint positions (20), normalized current
minus previous target (20), cube position in the wrist-tag frame in metres (3),
orientation error (6), and previous raw actor action (20). The second term is
**tracking error, not joint velocity**. Histories are concatenated per term,
oldest to newest, for 207 inputs; initial histories repeat the first frame.

For unit quaternions, policy rotation error is
`R(q_cube * inverse(q_goal))`, flattened to its last six row-major matrix
entries. This is not the display's scalar angular error, which is
`2 * acos(abs(dot(q_goal,q_cube)))` in radians before degree conversion.
The actor graph already includes learned observation processing; adding a
second normalizer changes the policy. Raw output becomes grasp-relative joint
angles and then an exponentially smoothed absolute target, not a direct cube rotation.
Joint order, addresses, soft limits and grasp angles are exported in `config.json`.

### Training Pipeline and Provenance

[Provenance](projects/dexterous-rl/checkpoints/provenance.json) pins Wuji's
`v2026.9.27`, commit `26b99c6338641e8edc17caf87922e6e1767121fa`, the release hash,
original checkpoint and actor hash. Local work reproduces evaluation, observations,
static assets and golden-vector validation. It does **not** retrain or distill.

The retained mjlab/RSL-RL configuration specifies 8,192 environments, 40 rollout
steps/environment, up to 5,000 iterations, an ELU actor (512/256/128), an ELU critic
(512/512/256/128), observation normalization, and a heteroscedastic Gaussian action
distribution. PPO configuration: clip 0.2; value coefficient 0.5 with unclipped
value loss; entropy coefficient 0.001; learning rate 1e-4; four epochs and
32 minibatches; gamma 0.99, GAE lambda 0.95 and gradient norm cap 1.
These are **release settings**, not measured completion counts or a new local run.

Rewards include orientation alignment (15), hand-pose penalty (-0.2), action-rate
penalty (-1), torque penalty (-24), fingertip sliding (-0.3), cage escape (-500),
finger collision (-1), hold escalation (11.4), and palm detachment (0.5);
high-frequency action penalty is configured with zero weight. Orientation uses
a linear tolerance with a 0.2 rad bound and π margin. Curriculum decorators and
reward-manager processing matter; the weights alone are not a complete scalar
reward equation. Exact terms are in the pinned upstream
[reward builder](https://github.com/wuji-technology/wuji-mjlab/blob/26b99c6338641e8edc17caf87922e6e1767121fa/src/wuji_mjlab/tasks/reorient/reorient_terms.py)
and [reward functions](https://github.com/wuji-technology/wuji-mjlab/blob/26b99c6338641e8edc17caf87922e6e1767121fa/src/wuji_mjlab/tasks/reorient/mdp/rewards.py), also retained in the
[source archive](projects/dexterous-rl/checkpoints/upstream-source-v2026.9.27.tar.gz).

Rollouts generate reward/critic-based advantages and value targets, rather than
expert-action labels. The configured PPO actor objective uses clipping, alongside
value and entropy terms; reward is not the neural loss. Original run logs,
realized curriculum and exact optimizer/run history are **not documented in this
repository**. The [saved config](projects/dexterous-rl/checkpoints/reference-source/src/wuji_mjlab/tasks/reorient/config/wuji_hand/rsl_rl/ppo.py)
and [training guide](projects/dexterous-rl/checkpoints/reference-source/docs/training.mdx)
are the reproducible starting point, not proof of a locally reproduced GPU run.

### Runtime and Deployment

The browser runs the evaluation scene with training corruption/randomization
removed, MuJoCo 3.11.0 and single-thread CPU ONNX inference. A fixed 20 Hz policy
clock advances 100 Hz physics in simulation time; slow devices slow simulation.
The first 0.4 simulated seconds use the official grasp. Drop below z=0.4099 m
stops simulation visibly; error <0.2 rad for five policy steps reports target reached.
Reset rejects stale inference and restores physical state without changing the goal.

### Limitations and References

[Recorded validation](projects/dexterous-rl/VALIDATION.md) includes ten frozen
contract vectors and all 12 seeded goals reached/held without drops. Those are
regression fixtures, not a general success-rate estimate. Browser deployment
retains the physical meshes and scene, but does not reproduce parallel GPU
training or prove hardware performance. See [project README](projects/dexterous-rl/README.md)
and [notices](projects/dexterous-rl/web/THIRD_PARTY_NOTICES.md).

## 3. EuroGuesser AI

### Overview

Guess the location of five European street photographs on an offline map and
compare great-circle distance/score with a locally running vision model. The
default Tiny model is a locally trained geographic student; the opt-in GeoCLIP
mode uses a much larger released encoder. Neither sends images to an inference API.

### System Architecture

```text
Local offline training (Docker, CPU)
  OSV-5M photographs + GPS -> country/sequence/spatial split
      -> training-only 96 geographic centres -> nearest-centre labels
      |                                                 |
      +-> frozen GeoCLIP teacher -> soft cells + 512-D embeddings
      |                                                 |
      +-> ImageNet MobileNet + new heads -> CE + KL + cosine loss
          -> heads training -> final-two-block fine-tuning
          -> validation selects checkpoint / retrieval -> locked fresh test
          -> FP32 ONNX + projected training-image/GPS reference index

Online inference and game
  photograph pixels -> matched 224x224 RGB preprocessing -> Worker
      -> ONNX student -> L2-normalized 512-D projection
      -> cosine retrieval, top 50 training references
      -> exp(10 * similarity) weighted GPS -> AI latitude/longitude
                                                  |
  player map pin ---------------------------------+
                                                  v
  answer GPS (UI only) -> haversine errors -> round scores -> map reveal

Optional direct path
  pixels -> CLIP bicubic/centre crop -> quantized-storage ViT-L/14
      -> GeoCLIP projection -> 512-D embedding -> offline GPS gallery
      -> top 20 / weight scale 50 -> geographic estimate -> same scoring
```

### Subsystem Inputs and Outputs

| Subsystem           | Input                                       | Processing                                                                       | Output                                      | Implementation                                                                                                                                  |
| ------------------- | ------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Data/game selection | Attributed photo pack and answer GPS        | Five different countries, device-local exposure balancing                        | Photo and answer retained by UI             | [round-selection.js](projects/euroguessr/src/round-selection.js), [app.js](projects/euroguessr/src/app.js)                                      |
| Tiny preprocessing  | Decoded RGB pixels                          | Half-pixel bilinear stretch; divide by 255; ImageNet channel normalization       | FP32 `[1,3,224,224]`                        | [preprocess.js](projects/euroguessr/src/preprocess.js), [training tensor](projects/euroguessr/training/train.py)                                |
| Tiny encoder/heads  | Image tensor                                | MobileNet features/pool → 576-D; geographic MLP and normalized linear projection | 96 logits, 576-D features, 512-D projection | [student_train.py](projects/euroguessr/training/student_train.py), [model metadata](projects/euroguessr/models/metadata.json)                   |
| Retrieval           | Projected embedding, reference features/GPS | Cosine ranking; exponential weights                                              | Latitude/longitude in degrees               | [geo.js](projects/euroguessr/src/geo.js), [inference.worker.js](projects/euroguessr/src/inference.worker.js)                                    |
| Optional GeoCLIP    | CLIP-normalized tensor                      | Image-only ViT-L/14 + 768 → 512 → 512 projection                                 | Normalized 512-D embedding                  | [export_geoclip_direct.py](projects/euroguessr/training/export_geoclip_direct.py), [metadata](projects/euroguessr/models/geoclip/metadata.json) |
| Comparison/map      | Player/AI GPS and answer                    | Haversine with Earth radius 6371 km; score and projection                        | Distances, scores, fixed-size map markers   | [geo.js](projects/euroguessr/src/geo.js), [app.js](projects/euroguessr/src/app.js)                                                              |

### Control / Learning Algorithm

The selected FP32 student has 1,394,816 parameters. Its ImageNet-1K V1
MobileNetV3-Small encoder pools to 576 features; the geographic head is
`576 → 256 ReLU → Dropout(0.25) → 96`, and projection is `576 → 512` with
L2 normalization. Browser inference is deterministic evaluation; dropout does
not randomly perturb guesses. Input channel means are `[0.485,0.456,0.406]`
and standard deviations `[0.229,0.224,0.225]`.

The deployed `distilled-50-t10` path uses the projection rather than the classifier's
argmax. For retrieved reference j with cosine similarity s_j, weight
`w_j = exp(10 * (s_j - s_max))`; latitude and longitude are separately averaged
with normalized weights. These are similarity weights, not calibrated probabilities
of a country or an exact location. Coordinates can fall between distant candidates.
The worker receives pixels and a token, never the round ID or answer GPS.

### Training Pipeline and Provenance

[Preparation](projects/euroguessr/training/prepare_experiment.py) uses OSV-5M
revision `cff33609b56b54d8743b7ee7a416eb8433e9a681`: country balancing, sequence
deduplication, hashed 3° spatial blocks and a ≥25 km train/holdout buffer. The
V2 split is 8,500 train / 961 validation / 363 fresh test. Fresh holdouts also
exclude nearby preserved V1 training references. This is a custom European
experiment, not the entire OSV-5M benchmark.

The student starts with pretrained ImageNet features and compatible V1 encoder
weights, while new training-only centres define geographic labels. A frozen
`geoclip==1.2.1` teacher with `openai/clip-vit-large-patch14` revision
`32bd64288804d66eefd0ccbe215aa642df71cc41` supplies normalized embeddings and
soft 96-cell targets for 5,000 covered training images. Teacher target probabilities
are the softmax of scaled image/location cosine scores divided by temperature T=2;
these are model-generated targets, not ground-truth GPS labels.

The exact selected loss in [loss_terms](projects/euroguessr/training/student_train.py) is:

```text
L = 0.5 * CE_weighted,smoothed(logits, nearest_GPS_cell)
  + 0.2 * T^2 * KL(teacher_probs || softmax(logits / T))
  + 0.3 * mean(1 - dot(normalized_student, normalized_teacher))
```

CE uses class weights and label smoothing 0.1 across the batch. KL uses PyTorch
`batchmean`; both teacher terms average over covered examples only and are zero
when none are covered. T is the cache's soft-target temperature, separate from
retrieval's similarity scale 10. The training loop caches the frozen prefix,
trains heads, then fine-tunes the final two encoder blocks. AdamW uses weight
decay 0.01; default head-stage LR is 1e-3 and fine-tuning LR 1e-4 (CLI overrides
are recorded in checkpoints). There is no extra random image augmentation in the
matched tensor preprocessing. Validation selects `best.pt` at epoch 42 and the
retrieval method before fresh-test evaluation. See the
[research methodology](projects/euroguessr/RESEARCH_V2.md) and
[tracked continuation bundle](projects/euroguessr/checkpoints/geoclip-v2/).

**Upstream GeoCLIP summary, separate from local student training.** The authors
report MP-16 (4.7M geotagged images) and contrastive image/GPS alignment.
The location encoder applies Equal Earth projection and multi-scale Fourier
features/MLPs to produce 512-D vectors. The released image side uses CLIP
ViT-L/14 with a learned projection. Upstream training code uses cross-entropy
to identify the paired GPS among batch coordinates and a GPS queue of negatives.
The original release's full run history is not documented here; its CLIP
pretraining also occurred upstream. Sources: [GeoCLIP authors](https://github.com/VicenteVivan/geo-clip),
[location encoder](https://github.com/VicenteVivan/geo-clip/blob/main/geoclip/model/location_encoder.py),
[training code](https://github.com/VicenteVivan/geo-clip/blob/main/geoclip/train/train.py).

```text
Upstream summary (no GeoCLIP retraining here)
  MP-16 image/GPS pairs -> CLIP image features + learned image projection
                       -> geographic encoder of paired / negative GPS
      -> contrastive cross-entropy -> released GeoCLIP weights
                                      |
                   +------------------+------------------+
                   v                                     v
          local teacher cache                image-only browser conversion
```

### Runtime and Deployment

Both modes use single-thread CPU ONNX Runtime Web/WASM in a Worker. The default
FP32 model/reference binary download is about 15.8 MB; its index has 5,000
512-D training-image projections. Direct GeoCLIP downloads about 320 MiB only
when selected. Its linear weights are stored UINT8, dequantized for FP32 arithmetic;
this is not fully integer inference. The location encoder runs offline to construct
a regular European GPS gallery and is excluded from the browser graph, as are
CLIP's text tower and tokenizer. Direct inference uses top 20 gallery locations
and similarity scale 50 with matched CLIP bicubic resize/centre crop.

The game uses local Natural Earth boundaries/city labels and no live tiles.
Each score is `round(5000 * exp(-distance_km / 1500))`, maximum 25,000 over
five untimed rounds. Model hashes protect cached assets. Ground truth remains
inspectable in static files; results stay in local storage unless explicitly exported.

### Limitations and References

[Shipped metadata](projects/euroguessr/models/metadata.json) records Tiny median
error 724 km on validation and 771 km on the 363-image fresh test; optional
GeoCLIP measured 372 km fresh-test median. These are localization errors, not
human win rates. Upstream pretraining overlap cannot be independently excluded.
Model-input resizing loses source detail; display zoom does not restore it.
The public game pack has 79 photographs across 39 countries from legacy held-out
data, separate from the V2 fresh-test cohort. Contributor source links and
CC BY-SA 4.0 attribution/modification notices are retained in the photo pack
and shown by the game. See [project README](projects/euroguessr/README.md),
[validation](projects/euroguessr/VALIDATION.md) and
[notices](projects/euroguessr/THIRD_PARTY_NOTICES.md).

## 4. RustZero

### Overview and Game

Play **6×6 Breakthrough** against a locally trained self-play agent. White moves
first; each side begins with 12 pawns on its two home ranks. Pawns move one square
forward, straight or diagonally; straight moves require an empty destination,
diagonal moves can enter empty squares or capture an enemy. Friendly occupancy
blocks both. Reaching the opposite back rank, eliminating enemy pawns, or leaving
the opponent without a legal move wins. All moves advance, so play terminates
without chess-style repetition/draw rules.

### System Architecture

```text
Local offline self-play / optimization (Rust, Docker, CPU)
  random-initialized network -> PUCT leaf policy/value evaluation
       ^                           |
       |                  128 simulations / move + root noise
       |                           v
       |                  play move -> new game position -> repeat
       |                           |
       |           saved states + normalized root visits + final winner
       |                           v
       |             (state, policy target pi, value target z)
       |                  + horizontally reflected examples
       |                           v
       +-- Adam <- policy CE + value MSE <- sampled replay batches
                       |
              checkpoint every five generations
                       v
  paired development arenas -> promotion / final tournament -> champion
                       -> independent held-out evaluation -> JSON weights

Online (same Rust rules / network / PUCT; training module excluded)
  pawn + destination click -> Worker -> validate legal action -> game state
                                                |
  JSON checkpoint -> Burn MLP [1,72] -> logits/value -> PUCT leaf expansion
                                                |
                            legal softmax priors + sign-flipped backups
                                                |
                    64 / 256 / 1024 simulations in yielding chunks
                                                v
                         highest-visit move -> updated game/history
                                                |
                     Worker snapshot / search stats -> JavaScript board UI
```

### Subsystem Inputs and Outputs

| Subsystem         | Input                               | Processing                                                  | Output                                          | Implementation                                                                                                                       |
| ----------------- | ----------------------------------- | ----------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Rules/state       | White/Black bitboards, side, action | Legal move generation, capture, terminal evaluation         | Next position, legal actions, outcome           | [game.rs](projects/rustzero/src/game.rs)                                                                                             |
| Encoding          | Position                            | Rotate Black's perspective 180°, own/enemy occupancy planes | 72 binary f32 entries (`[2,6,6]` flattened)     | [Position::encode](projects/rustzero/src/game.rs)                                                                                    |
| Network           | Batch `[B,72]`                      | Linear 72→64 ReLU, policy 64→108, value 64→1 tanh           | `[B,108]` logits, `[B,1]` value                 | [model.rs](projects/rustzero/src/model.rs)                                                                                           |
| Search            | Position, evaluator, budget         | Legal softmax, PUCT, alternating backup                     | Visits, priors, Q, search value, best action    | [mcts.rs](projects/rustzero/src/mcts.rs)                                                                                             |
| Self-play/targets | Current learner, config/RNG         | Noisy search, early sampling, terminal winner, reflection   | State/visit-policy/outcome examples             | [training.rs](projects/rustzero/src/training.rs)                                                                                     |
| Optimization      | Random replay batches               | Autodiff policy CE + value MSE; Adam                        | Updated parameters/checkpoints and loss metrics | [training.rs](projects/rustzero/src/training.rs)                                                                                     |
| Browser/history   | UI requests, JSON checkpoint        | WASM Game interface, search chunks, Undo/Redo               | State snapshots and candidate statistics        | [browser.rs](projects/rustzero/src/browser.rs), [worker.js](projects/rustzero/web/worker.js), [app.js](projects/rustzero/web/app.js) |

### Model and Search Algorithm

The 11,757-parameter MLP is deliberately smaller than a residual CNN. Own/opponent
binary planes always use the side-to-move perspective; value is in [-1,1] from
that same perspective. Action `3*s+d` has canonical row-major source square s
and direction d=0/1/2 (forward-left/straight/right), for 108 possible logits.
Rules mask illegal moves before a stable softmax creates search priors.
Logits themselves are neither probabilities nor legal-move guarantees.

PUCT selects the edge maximizing:

```text
Q(s,a) + c * P(s,a) * sqrt(N(s) + 1) / (1 + N(s,a)), c = 1.5
```

P is the legal-action prior; N(s) is parent visits, N(s,a) edge visits, and Q
is mean backed-up value (zero on unvisited edges). New leaves use network value;
terminal leaves use rule outcomes. Each backup negates child value because turns
alternate. Exploration remains active for unvisited edges. Root visit shares
form the search policy; maximum visits choose the browser move. The UI's AI
estimate is an aggregate search value, not a calibrated winning probability.

### Training Pipeline, Targets and Optimization

Local training is independently supported by source, configuration, metrics and
[run metadata](projects/rustzero/web/metrics/run-metadata.json), not just an author
statement. The [runner](projects/rustzero/scripts/run-experiment.py) executes native
Rust through Docker, checks committed source hashes, and records independent
training/development/holdout seeds. Burn 0.21 Flex f32 uses CPU computation;
no GPU is needed. Exact training CPU model/core allocation is **not documented in
the saved run metadata**, so no hardware-specific throughput comparison is claimed.

The [strong configuration](projects/rustzero/configs/strong.toml) and metrics record
200 generations × 96 games = **19,200 self-play games**, seed 1701, 128 simulations
per move, 240 Adam steps/generation = **48,000 updates**, batch 128, learning rate
0.001 and FIFO replay capacity 100,000 examples. Self-play uses the current
learner (not the separately promoted champion). Symmetric Dirichlet alpha 0.3
mixes 25% noise into root priors; moves sample visit probabilities for the first
12 plies and then choose maximum visits. Each position is stored twice with a
horizontal reflection and correspondingly reflected action target.

Policy target pi is normalized **search visits**, not the chosen move's one-hot
label or an expert move. Value target z is +1 for the recorded side's eventual
win and -1 for loss, derived after the game ends. For batch size B:

```text
L_policy = -(1/B) * sum_b sum_a pi[b,a] * log_softmax(logits[b])[a]
L_value  =  (1/B) * sum_b (v[b] - z[b])^2
L_total  = L_policy + L_value
```

Both loss coefficients are 1. Training policy softmax spans **all 108 logits**;
illegal actions have zero target mass. Search instead normalizes over legal actions.
The implemented loss has no extra AlphaZero L2 regularization term. Adam samples
replay with replacement and updates from autodiff gradients. No expert games,
heuristic labels, tablebases or solver moves enter this replay; handcrafted agents
are evaluation opponents only.

Every five generations, paired development games promote a candidate above 55%
against the champion. A final representative-checkpoint round robin chooses the
highest total development score. **Gen 200** was selected this way; holdout seed
78123 is separate from development 90210 and training 1701. Each opening has
2–4 seeded random legal plies and is played in both color assignments. The
[persisted results](projects/rustzero/web/metrics/holdout.json) have 400 games per
matchup: champion at 256 simulations won 400/400 against random, greedy heuristic,
and heuristic MCTS-256, and 398/400 against heuristic MCTS-1024. These describe a
fixed opening protocol, not universal playing strength.

Recorded generation phase totals are 741.7 s self-play and 52.5 s optimization;
compilation, arenas and tournament time are separate. Logged mean total loss went
from 4.822 at generation 1 to 2.338 at generation 200. See
[validation](projects/rustzero/VALIDATION.md) and
[training metrics](projects/rustzero/web/metrics/training.json) for scope and evidence.

### Runtime and Deployment

[`Cargo.toml`](projects/rustzero/Cargo.toml) gates training behind the `training`
feature; [`lib.rs`](projects/rustzero/src/lib.rs) excludes that module from the
browser build. Rust rules, network and PUCT compile to WASM. The Worker loads
JSON weights into the same network and streams statistics in 32-simulation chunks
with zero-delay yields. Fast/Strong/Nightmare use 64/256/1024 simulations; browser
search has no training root noise or temperature sampling. New games/checkpoint
changes replace the Worker; epochs/request IDs reject stale results. Two-player
mode uses rules/history without loading a network. JavaScript renders the board;
there is no physics engine in this discrete game.

### Limitations and References

This is an AlphaZero-style small self-play experiment, not AlphaZero-equivalent
scale or a formal game solver. Fixed opening evaluations and one training seed
limit generalization claims; more simulations are not uniformly better in all
measured matchups. Human invincibility, structured human win rates and physical
phone latency are unmeasured. See [project README](projects/rustzero/README.md),
[validation](projects/rustzero/VALIDATION.md), [checkpoint selection](projects/rustzero/web/metrics/tournament.json)
and the [independent 6×6 solution reference](https://cris.maastrichtuniversity.nl/en/publications/solving-breakthrough-for-the-6x6-board/).


## Shared Website Build

The homepage features exactly the four demos described above. Their individual
READMEs provide source, reproduction commands, model/data provenance and
validation. The [blog demo index](https://leonardo-maglanoc.com/blog/AI-coding-agent-case-study/)
retains links to the wider archive.

Build and preview the Jekyll shell from the repository root with Docker:

```sh
docker compose run --rm jekyll bundle exec jekyll build
docker compose up -d preview
# http://127.0.0.1:8080/
```

Stop the nginx preview before using the Jekyll watch server because both use
port 8080. The [Deploy site workflow](.github/workflows/deploy.yml) assembles and
checks the complete published site before deploying to GitHub Pages. The four
demos use local static assets; training remains offline. Serve previews over
HTTP, not `file://`, and retain JavaScript MIME for `.mjs` and WebAssembly MIME
for `.wasm`. Chrome viewport checks establish layout and interaction behavior,
not universal browser compatibility or physical-phone performance.

The featured cards are defined in [_data/homepage.yml](_data/homepage.yml) and
rendered by [_includes/homepage_demos.liquid](_includes/homepage_demos.liquid).
They share 960×600 previews, a two-column desktop layout and one column on
narrow screens. Demo-specific notices are linked in each chapter; the website
uses al-folio/Jekyll under the repository [LICENSE](LICENSE).
