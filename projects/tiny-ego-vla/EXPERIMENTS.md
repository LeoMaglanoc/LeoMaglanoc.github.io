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
