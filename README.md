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
| [Humanoid Walking](https://leonardo-maglanoc.com/locomotion/)             | Recurrent actor, 47 observations → 12 leg actions; joint PD control          | Released Unitree G1 PPO actor; local ONNX export, no retraining               | ONNX Runtime Web CPU/WASM, MuJoCo WASM, Three.js               |
| [Dexterous Cube Orientation](https://leonardo-maglanoc.com/dexterous-rl/) | 207 observations → 20 hand actions; filtered joint targets                   | Released Wuji Hand 1 PPO actor; no local training or distillation             | ONNX Runtime Web CPU/WASM, MuJoCo 3.11.0 WASM, Three.js        |
| [EuroGuesser AI](https://leonardo-maglanoc.com/euroguessr/)               | MobileNetV3-Small geographic student + embedding retrieval; optional GeoCLIP | Local OSV-5M supervision/distillation from pretrained ImageNet/GeoCLIP models | Single-thread ONNX Runtime Web/WASM in a CPU Worker; local map |
| [RustZero](https://leonardo-maglanoc.com/rustzero/)                       | Small policy/value MLP + PUCT for 6×6 Breakthrough                           | Local CPU self-play from random initialization                                | Rust/Burn Flex f32 compiled to WASM in a Worker; JavaScript UI |

These are different systems: the robotics actors choose controls for physical
simulation, EuroGuesser retrieves geographic coordinates, and RustZero searches
a discrete game tree. None trains a neural network during browser play.
[The source audit](docs/featured-demo-evidence.md) maps claims to implementation
and saved artifacts. Project READMEs retain detailed reproduction instructions.

## 1. Humanoid Walking

### Overview

Steer a Unitree G1 with forward/lateral velocity and yaw-rate commands, and apply
physical pushes to test recovery. The public `/locomotion/` playground embeds the
existing G1 simulator. Its retained B2 MPC experiments are separate and are not
initialized by this public page. The robot is the official **12-DoF leg model**,
not the 29-DoF whole-body model.

### System Architecture

```text
Offline preparation (local; upstream training is separate)
  Unitree released motion.pt -> reconstruct explicit-state LSTM actor
      -> TorchScript / PyTorch / ONNX sequential parity -> policy.onnx

Online feedback loop (rates per simulated second)
  keyboard / touch -> [vx, vy, yaw rate] -----------------------+
                                                               v
  MuJoCo qpos/qvel -> scaled proprioception + previous action + phase
       ^                                                       |
       |                                               [1,47] observation
       |                                                       v
       |   hidden/cell [1,1,64] <-> LSTM + action head @ 50 Hz
       |                                                       |
       |                                            12 position offsets
       |                                                       v
       |                         default angles + 0.25 * action (rad)
       |                                                       |
       +-- MuJoCo @ 500 Hz <- joint PD torques @ 500 Hz <--------+
                |
                +-> simulated body poses -> Three.js -> WebGL frame
```

### Subsystem Inputs and Outputs

| Subsystem   | Input                                                    | Processing                                                    | Output                                         | Implementation                                                                                    |
| ----------- | -------------------------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Commands    | Keyboard/touch                                           | Bound vx ±1 m/s, vy ±0.5 m/s, yaw ±1 rad/s                    | Three velocity commands                        | [input.js](projects/g1/src/input.js), [config.js](projects/g1/src/config.js)                      |
| Observation | MuJoCo qpos/qvel, command, previous action, physics step | Scale and concatenate; quaternion w,x,y,z → projected gravity | Float32 `[1,47]`                               | [observations.js](projects/g1/src/observations.js)                                                |
| Actor       | Observation; hidden/cell `[1,1,64]` each                 | 47 → 64-unit LSTM → 32 ELU → 12                               | `[1,12]` action and next recurrent states      | [export_policy.py](projects/g1/tools/export_policy.py), [policy.js](projects/g1/src/policy.js)    |
| Servo       | Action, joint angles/velocities                          | Position offsets → PD torque                                  | 12 actuator torques                            | [controller.js](projects/g1/src/controller.js)                                                    |
| Physics     | Torques, optional pelvis force                           | 10 × 0.002 s MuJoCo steps per actor decision                  | Updated floating base/joint state and contacts | [simulation.js](projects/g1/src/simulation.js), [asset manifest](projects/g1/asset-manifest.json) |
| Display     | Simulated body transforms                                | Mesh transforms, camera and UI                                | Rendered robot and controls                    | [renderer.js](projects/g1/src/renderer.js), [main.js](projects/g1/src/main.js)                    |

### Control / Learning Algorithm

The 47 observation values are angular velocity (3), projected gravity (3),
commands (3), joint-angle offsets (12), joint velocities (12), previous raw action
(12), and sin/cos gait phase (2). There is no camera or terrain-height input.
Projected gravity uses the floating-base quaternion; angular velocity uses MuJoCo
`qvel[3:6]`. Positions and velocities follow the explicit left-leg/right-leg joint
order in `config.js`; free-base entries are excluded from joint vectors.

Scaling is 0.25 for angular velocity, 1 for angle offsets, 0.05 for joint velocity,
and `[2,2,0.25]` for commands. Phase repeats every 0.8 simulated seconds.
The previous action is a network output, not an applied torque. Temporal memory
is the LSTM state, not a stack of observation frames; reset clears both states.

For joint i, the implemented controller is:

```text
q_target[i] = q_default[i] + 0.25 * action[i]
torque[i]   = Kp[i] * (q_target[i] - q[i]) - Kd[i] * dq[i]
Kp         = [100,100,100,150,40,40] repeated for both legs
Kd         = [2,2,2,4,2,2] repeated for both legs
```

Angles are radians, velocities rad/s and actuator torques N·m. These explicit
torques feed physics; Three.js only displays the computed motion.

### Training Pipeline and Provenance

The retained [`motion.pt`](projects/g1/models/motion.pt) comes from Unitree's
`deploy/pre_train/g1/motion.pt`; the local exporter retains its learned weights.
Unitree's [upstream workflow](https://github.com/unitreerobotics/unitree_rl_gym)
trains in Gym, exports actors and evaluates them in MuJoCo before physical
robot deployment. The project identifies this actor as PPO, but **the exact
training run's reward weights, optimizer settings, randomization, iteration
count and learning curves are not documented in this repository**. Current
upstream defaults do not independently establish how this released file was trained.

```text
Upstream PPO training summary (not a reproduced checkpoint training run)
  simulated robot + commands -> observations/actions + task rewards
      -> critic estimates / advantages -> PPO updates -> updated actor
      ^                                                       |
      +---------------- subsequent rollouts ------------------+
                                     |
                             released motion.pt
```

This is reinforcement learning: actions are sampled during rollouts, rewards
assess behavior, and advantage/value targets are derived from trajectories.
There are no supervised "correct joint angle" labels here. PPO's reward signal
and its network optimization objective are distinct. An exact checkpoint-specific
loss or reward equation cannot be recovered from the inference-only actor.
No local robot-policy training is claimed.

### Runtime and Deployment

[`projects/locomotion-playground/`](projects/locomotion-playground/README.md)
wraps [`projects/g1/`](projects/g1/README.md) in a disposable iframe. Static
assets publish under `assets/interactive/`; ONNX Runtime uses a single-thread
WASM CPU provider. The simulation clock schedules 50/500 Hz in **simulation
time**; these rates do not promise 500 rendered frames or real-time performance
on every phone. Asynchronous inference/reset tokens protect recurrent state.

### Limitations and References

[Export validation](projects/g1/tools/validate_policy.py) compares TorchScript,
reconstructed PyTorch and ONNX actions/states, with the exporter enforcing maximum
absolute error ≤1e-5. This establishes numerical contract agreement, not identical
long-horizon physics or safe real-robot transfer. Browser pose comes from simulation,
not sensors on a physical robot. See [policy interface](docs/POLICY_INTERFACE.md)
and [third-party notices](projects/g1/THIRD_PARTY_NOTICES.md).

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
BlockTemple remains available at [its existing route](https://leonardo-maglanoc.com/block-temple/).

## Running Locally

From the repository root, build the static site with Docker and serve it with nginx:

```bash
docker compose run --rm jekyll bundle exec jekyll build
docker compose up -d preview
```

Open [http://localhost:8080/](http://localhost:8080/). Stop `preview` before
starting `docker compose up jekyll` for the watch/development server: both own
port 8080. `docker compose pull` refreshes the configured images. The nginx
preview configuration serves `.mjs` as JavaScript and `.wasm` as WebAssembly,
so ES-module imports match production behavior.

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

## Deployment and Browser Compatibility

[GitHub Actions](.github/workflows/deploy.yml) publishes project assets, builds
Jekyll, and deploys the generated static site to GitHub Pages. Route pages in
`_pages/` and fullscreen layouts embed `assets/interactive/<demo>/`; no training
process or inference server is deployed. Preserve the source/runtime separation:
edit `projects/`, then publish with `scripts/publish-project-assets.py` when
runtime files change. This featured-card/documentation change does not alter
model weights or runtime source.

Use a browser with WebAssembly and, for the robotics scenes, WebGL. CPU/WASM
inference avoids requiring WebGPU and uses one thread in the browser. Large
GeoCLIP assets are opt-in. Serve over HTTP locally rather than opening `file://`;
production uses HTTPS. A Chrome viewport check demonstrates responsive layout,
not measured performance on physical Android/iOS hardware or proof of every
browser's numerical behavior.

Homepage cards come from `_data/homepage.yml` via
`_includes/homepage_demos.liquid`. The existing 960×600 image convention, 8:5
crop, two-column desktop and single-column narrow layout are preserved.
[Current validation](docs/featured-demo-validation.md) records Docker checks,
Chrome desktop/portrait/landscape observations, navigation and gameplay.

## Credits, Model/Data Provenance, and References

- Unitree G1 robot/model/policy: [Unitree RL Gym](https://github.com/unitreerobotics/unitree_rl_gym),
  BSD-3-Clause; [local notices](projects/g1/THIRD_PARTY_NOTICES.md).
- Wuji Hand 1: [pinned source and release identity](projects/dexterous-rl/checkpoints/provenance.json),
  Apache-2.0; [redistribution notices](projects/dexterous-rl/web/THIRD_PARTY_NOTICES.md).
- EuroGuesser: [OSV-5M](https://huggingface.co/datasets/osv5m/osv5m) / Mapillary contributors
  (CC BY-SA 4.0), TorchVision ImageNet initialization, released GeoCLIP/CLIP,
  Natural Earth map data; [full notices](projects/euroguessr/THIRD_PARTY_NOTICES.md).
- RustZero: local weights from recorded self-play; [Burn](https://github.com/tracel-ai/burn)
  and wasm-bindgen provide runtime/training infrastructure. Configurations,
  source and checkpoint hashes are retained with the published metrics.
- MuJoCo, Three.js and ONNX Runtime licenses remain in project notices.
  Site design uses al-folio/Jekyll; see the repository [LICENSE](LICENSE).

Other projects retain their own credits. The absence of original upstream run
logs is stated in each applicable section; a saved inference graph does not
establish a complete training history.

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

### G1 Loco-Manipulation

[G1 Loco-Manipulation](https://leomaglanoc.github.io/loco-manipulation/) runs
OmniContact's released 29-joint transformer in client-side MuJoCo physics, with
Carry & Place, Push Box, editable task coordinates and physical disturbances.
Source, Docker instructions, provenance and validation are in
[`projects/g1-loco-manipulation/README.md`](projects/g1-loco-manipulation/README.md).
