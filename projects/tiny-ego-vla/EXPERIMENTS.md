# Experiment ledger

## 2026-10-07 — feasibility

- CPU PyTorch 2.14.1, Python 3.10.12, no CUDA. Laptop has 15 GiB RAM.
- MobileCLIP2-S0: median single image 0.1624 s; 16-image batch 2.4197 s; text 0.0582 s; dimension 512.
- MobileCLIP-S0: median single image 0.1012 s; 16-image batch 1.2627 s; text 0.0315 s; dimension 512. Selected.
- RSS from sequential benchmarking: 888 MiB (MC2), 977 MiB (S0). These are process snapshots after warmup and allocator retention, not isolated model peak RAM.
- LIBERO official revision `8f1084e3132a39270c3a13ebe37270a43ece2a01` with robosuite 1.4.1 and MuJoCo 3.2.7, software OSMesa rendering.
- Default dual-camera reset including initial compilation: 21.58 s; 30 rendered steps: 17.72 s. Official demonstration 0 reaches task success after action replay.
- Tuned single-camera 128 px renderer, shadows/reflections off, LP_NUM_THREADS=4: reset 6.87 s, 7.88 rendered steps/s, 31.46 physics steps/s. Rendering at observation times only is used for policy evaluation.
- Initial editable LIBERO install did not expose its namespace package; `setup_libero()` adds the pinned source directory explicitly. Missing `gym` resolved with 0.26.2. Latest NumPy/MuJoCo/MediaPipe replaced with compatible pinned versions. No simulator source was patched.
- An initial EPIC P01_01 download was aborted at 79 MiB after discovering the source was 6.2 GB. Use P01_03 (119 s), P01_04 (105 s), P01_08 (99 s) instead. The incomplete original is unused.
- EPIC's supplied hand-object detections are <1 MB per chosen source, making sparse SAM unnecessary. They are model predictions and may miss or switch objects.

Raw machine-readable benchmark files remain in ignored `artifacts/`. Final summaries are exported with the exhibit.

## Fixed protocol before policy evaluation

Configuration is `configs/experiment.json`. Human split: P01_03/P01_08 train, P01_04 validation; no cross-video windows. Robot split, per task: demonstration IDs 0–34 train pool; 35–41 validation; 42–49 test. Budgets: first 4, 9 and 35 training demonstrations (11.4%, 25.7%, 100% of the training pool). Training seeds: 11, 29, 47. Five rollout starts are test demonstration states 42–46. These starts repeat across seeds; pooled episode counts are not independent samples.

MLP, GRU and 2-layer Transformer trunks are compared on human validation loss. The selected architecture is then held fixed across both robot initialization regimes. Ego checkpoints are selected using only the human validation video; robot checkpoints use only validation action MSE. Held-out test action MSE and rollout outcomes are descriptive, never used to select weights. Both paired robot runs have identical action-head initialization, training data, minibatch order, epochs and optimizer settings.

Action observations use four frames at 10 Hz and eight proprioception values. Predict two 7D control actions, execute at 20 Hz. Gripper predictions are thresholded to ±1. Evaluation uses RGB + proprioception only, with no supplied expert actions or object state. Software rendering removes shadows/reflections for throughput; this differs slightly from stored demonstration images and may introduce visual domain shift. Both variants use the same evaluation renderer.

Raw video timestamps triggered an FFmpeg duration warning during conversion, but source durations and fixed-rate decoded frame counts are checked. The human processing delegate reports CPU XNNPACK; MediaPipe also initializes an unused OpenGL context, which is not evidence of GPU neural inference.

## Observation/action timing correction (before training)

The simulator parity audit found a one-step convention in official LIBERO HDF5 generation. `create_dataset.py` executes action j, records the resulting observation, but retains pre-action state j and action j in the same row. Comparing stored proprioception to simulator states confirmed this: next-state errors were 0.000068, 0.000552 and 0.000437 at sampled steps 0/40/80, versus same-index errors 0.00217, 0.01379 and 0.01077.

We therefore pair observation j with future actions j+1 and j+2, dropping observations without both future actions. `align_actions.py` corrects already cached arrays without rerunning MobileCLIP; new caches use this alignment directly. All paired runs use the corrected targets. Rollouts start from held-out demo state index 1, matching the initial post-action observation convention, and receive no reference actions. This is documented as a departure from blindly using same-index targets.

## Human pretraining results

All architectures trained for 80 epochs on 884 windows, with 387 validation windows from the held-out P01_04 source. Among training windows: 682 have wrist targets, 754 object targets, and 845 contact labels. Validation: 294 wrist, 333 object, 367 contact labels.

| Architecture, seed 11 | Trainable parameters | Best validation loss | Selected epoch | CPU training time |
| --------------------- | -------------------: | -------------------: | -------------: | ----------------: |
| MLP                   |              190,149 |             0.168298 |              1 |           10.01 s |
| GRU                   |              223,557 |             0.167424 |              2 |           17.03 s |
| Transformer           |              389,957 |             0.167372 |              3 |           21.10 s |

Transformer is selected by the predeclared lowest-human-validation-loss criterion. Its margin over GRU is tiny; this is not evidence of an architectural advantage. Robot adaptation uses 412,014 trainable parameters. Additional human Transformer seeds 29/47 also select epoch 3: validation losses 0.164452 / 0.165983, training times 17.13 / 24.73 s. They retain their own checkpoints and metrics; both also trail the constant baseline.

**Negative sanity check:** the train-only constant displacement/contact predictor obtains validation loss 0.163751, better than all seed-11 candidates. For the selected model, wrist x/y normalized-image MAE is 0.0310/0.0446 versus zero-motion 0.0306/0.0424; object x/y MAE is 0.0283/0.0376 versus zero-motion 0.0260/0.0358. Later epochs reduce training loss while validation worsens. The current human pretraining has not demonstrated generalizable motion prediction. Any robot effect must be interpreted cautiously: changing initialization can act as regularization without establishing useful human manipulation knowledge.

Likely limitations to investigate are too few independent clips, camera motion in raw 2D displacement, detector identity switches and contact bias, and semantic frozen features that may not preserve precise geometry. No causal diagnosis is claimed from this one subset. Next experiments should add camera-motion compensation, stronger object identities, more participants and separate human test videos before increasing model size.

Caching took 1,099.14 s for the 100 robot demonstrations and 559.88 s for 3,231 human frames (under concurrent preprocessing/load). Cached embeddings are reused for every training run. Human preprocessing timings excluding initial video conversion: 106.42 s, 122.53 s and 119.99 s for P01_03/P01_08/P01_04 respectively. These are development-laptop timings, not mobile benchmarks.

## Interpretation and deferred work

Robot action/proprioception normalization is fitted separately on each training budget and reused by both paired regimes. Normalized MSE is comparable within a budget; its scale changes between budgets. Data-efficiency charts therefore use closed-loop task success. The larger budgets also produce more optimizer steps at the fixed 100 epochs; paired regimes receive the same steps.

The three temporal architectures were compared on human validation, not swept on robot success. No language-free, temporal-free, shuffled-human-label, or unrelated-pretraining robot ablation was performed. Those controls would help distinguish task-relevant transfer from an initialization/regularization effect. No independent human test split was available: the held-out human video is the validation set used for checkpoint/architecture selection.

RL is a no-go for this version. The primary paired imitation experiment and complete fixed evaluation take priority, and the human predictor has not passed its generalization sanity check. The practice stage explicitly describes a possible future residual policy rather than reporting unperformed reward optimization.

Recommended next studies: expand to independently recorded participants and a separate human test set; compensate camera motion and maintain object identities; establish a human predictor that beats constant/zero-motion baselines; add shuffled-label and unrelated-pretraining controls; then evaluate new robot starts and tasks with more independent seeds. Preserve this version’s frozen evaluation records and use new configuration/run directories.

## Continuation exercised during development

The execution session terminated the final robot training run (ego-pretrained, budget 35, seed 47) after its epoch-59 checkpoint. It was resumed from `last.pt`, restoring model, AdamW optimizer, PyTorch/NumPy/Python RNG and minibatch-generator state for epochs 60–100. No hyperparameters, data, model architecture or checkpoint-selection rule changed. Earlier checkpoints did not store accumulated elapsed time, so this one run explicitly reports only its resumed segment (`seconds_scope`); it must not be compared as a full-run CPU timing. New checkpoints preserve accumulated elapsed seconds. Completed-run `--resume` now returns the original metrics without overwriting timings.
