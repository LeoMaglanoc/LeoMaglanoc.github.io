# TinyEgoVLA

A CPU-scale experiment: egocentric human interaction prediction → shared representation → Panda behavioral cloning. Static research exhibit at `/tiny-ego-vla/`.

## Assessment and scope

The original plan's central comparison is sound. Human hand coordinates are supervision for a representation, never robot actions. We preserve the embodiment gap and measure whether pretraining helps rather than assume it does.

Changes based on feasibility evidence:

- MobileCLIP-S0 is selected over MobileCLIP2-S0 after local CPU benchmarks.
- Small EPIC-KITCHENS source videos and supplied hand-object detector outputs avoid gated datasets and SAM processing. MediaPipe supplies 21-joint hand skeletons. Detector contact and matched box motion are noisy pseudo-labels, not manual physical ground truth.
- Official LIBERO spatial tasks: bowl next to plate; bowl next to ramekin. Both place the indicated black bowl onto the plate. Different distractor arrangements mean language grounding cannot be established independently of scene cues.
- Two-step action chunks with four cached image observations. No image encoder training. Runtime browser has no model, API, simulator or training dependency.
- Reinforcement learning is gated behind successful imitation experiments. It must not be implied by the exhibit if it was not performed.

## Layout

`tools/` contains offline scripts; `configs/experiment.json` fixes splits and budgets. `data/`, `artifacts/`, `.venv/`, and `checkpoints/` are local and ignored. Public static assets live in `assets/interactive/tiny-ego-vla/`.

The pinned environment, reproduction commands and checkpoint restoration instructions are below; `EXPERIMENTS.md` records measured results and `VALIDATION.md` records browser and deployment checks. The source brief remains in the user's `plan.md` without modification by this implementation.

## Reproduce the experiment

From the repository root (Linux; FFmpeg and the system OSMesa library are required):

```sh
uv venv projects/tiny-ego-vla/.venv --python 3.10
uv pip install --python projects/tiny-ego-vla/.venv/bin/python torch==2.14.1 torchvision==0.29.1 --index-url https://download.pytorch.org/whl/cpu
uv pip install --python projects/tiny-ego-vla/.venv/bin/python -r projects/tiny-ego-vla/requirements.txt
PY=projects/tiny-ego-vla/.venv/bin/python
$PY projects/tiny-ego-vla/tools/prepare.py
$PY projects/tiny-ego-vla/tools/benchmark_encoder.py
$PY projects/tiny-ego-vla/tools/benchmark_sim.py
$PY projects/tiny-ego-vla/tools/benchmark_sim_fast.py
$PY projects/tiny-ego-vla/tools/preprocess_ego.py
$PY projects/tiny-ego-vla/tools/cache_embeddings.py ego
$PY projects/tiny-ego-vla/tools/cache_embeddings.py robot
$PY projects/tiny-ego-vla/tools/align_actions.py
$PY projects/tiny-ego-vla/tools/audit_sim_parity.py
$PY projects/tiny-ego-vla/tools/audit_data.py
$PY projects/tiny-ego-vla/tools/train_ego.py
$PY projects/tiny-ego-vla/tools/train_robot_bc.py
$PY projects/tiny-ego-vla/tools/eval_robot.py
$PY projects/tiny-ego-vla/tools/export_media.py human
$PY projects/tiny-ego-vla/tools/export_media.py expert
$PY projects/tiny-ego-vla/tools/render_rollouts.py
$PY projects/tiny-ego-vla/tools/export_web.py
$PY projects/tiny-ego-vla/tools/check_checkpoints.py
node projects/tiny-ego-vla/tests.mjs
$PY projects/tiny-ego-vla/tools/bundle_checkpoint.py
$PY projects/tiny-ego-vla/tools/verify_bundle.py
```

The LIBERO source is pinned and loaded explicitly by `setup_libero()`; no editable package installation is needed. No vendor source patch is required. `environment-lock.txt` records the complete actual environment; recreate from that lock for closer dependency parity. Do not install CUDA wheels. On this laptop the necessary OSMesa library was already installed.

Dataset download URLs and SHA-256 hashes are recorded in `data-manifest.json`. Official EPIC footage totals about 1.2 GB, the two robot HDF5 files about 1.2 GB. Only three short processed clips, recorded overlays, predictions, compressed robot replays and JSON measurements are published. No datasets, models or training are required in the browser.

Human embeddings are paired normalized image/text vectors. Robot images use the upright flip of the stored OpenGL image. Robot proprioception matches LIBERO's end-effector position, axis-angle orientation and gripper qpos. Official stored observations are **post-action**; future targets are actions j+1/j+2, with incomplete terminal chunks dropped. See the timing audit in `EXPERIMENTS.md`.

## Continue from checkpoints

Each ignored `checkpoints/ego-{kind}-{seed}/` and `checkpoints/robot-{regime}-{budget}-{seed}/` holds `best.pt`, `last.pt`, and `metrics.json`. `best.pt` is the validation-selected artifact for evaluation. `last.pt` is the continuation state. Checkpoints include optimizer state, exact fixed configuration, normalization (robot), PyTorch/NumPy/Python RNG, data-loader RNG, epoch, full curve, source/config/environment/data-manifest fingerprints, and starting Git revision.

```sh
$PY projects/tiny-ego-vla/tools/train_ego.py --kind transformer --seed 11 --resume
$PY projects/tiny-ego-vla/tools/train_robot_bc.py --budget 4 --seed 11 --resume
```

The validation-selected architecture for this run is the two-layer Transformer. A completed run has no remaining epochs, so resuming it does not silently train longer. A changed configuration is deliberately rejected by `--resume`; use a new experiment directory/configuration and explicitly warm-start model weights for a new study. Preserve the original splits and records when investigating improvements. No checkpoint is selected using rollout outcomes.

`checkpoint-record.json` identifies the local continuation archive and its SHA-256. The archive is **not in Git**. It contains code/config, both model checkpoints, the frozen encoder, all cached embeddings/normalized-data inputs, human pseudo-labels, metrics and raw rollout states/actions/frames. It does not include the raw source videos or robot HDF5 files; those are restored with `prepare.py` and verified against `data-manifest.json`.

To restore: clone this repository into a separate checkout and extract the archive into its `projects/tiny-ego-vla/` directory, preserving that layout (the scripts derive repository paths from their location). Verify every `artifacts/continuation-manifest.json` file hash with `verify_bundle.py`, recreate the pinned environment, restore raw inputs if new preprocessing/evaluation is needed, and use the saved configuration. Update the archive path in the local copy of `checkpoint-record.json` after moving it; retain the recorded SHA-256. Existing cached arrays suffice for training continuation. Preserve source artifact licensing when redistributing any derived data.
