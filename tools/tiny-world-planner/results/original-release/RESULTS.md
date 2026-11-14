# Measured release results

Training seed: 714. Dataset: 700 episodes × 80 actions, split by whole episode. True contact fraction: 17.1%; movement fraction: 26.3%.

Representation training: vicreg+auxiliary_pose_and_metric, vicreg+auxiliary_pose_and_metric.

Training/export elapsed 350.1 seconds on the local CPU; this is an observed run time, not a hardware-independent promise.

## Prediction on held-out episodes

| Horizon | Latent MSE ± SD | Static MSE | Decoded xy error (units) | Angle error (rad) |
|---:|---:|---:|---:|---:|
| 1 | 0.0088 ± 0.0254 | 0.0142 | 0.288 | 0.239 |
| 3 | 0.0285 ± 0.0684 | 0.0636 | 0.327 | 0.269 |
| 5 | 0.0470 ± 0.1078 | 0.1224 | 0.366 | 0.298 |
| 8 | 0.0743 ± 0.1572 | 0.2131 | 0.416 | 0.337 |

## Planning benchmark

ONNX Runtime Web 1.21.0 WASM in Node, single thread; not browser or phone timing; CEM search only, excluding image encoding and diagnostic decoding

50 reserved seeds per difficulty, 100 actions per task, same seeds for both methods. Success: ≥95% coverage for three consecutive actions. No privileged planner inputs.

| Difficulty | Method | Success | Mean final coverage | Mean planning latency |
|---|---|---:|---:|---:|
| easy | random | 0/50 (0%) | 37.6% | 0.00 ms |
| easy | latent-mpc | 0/50 (0%) | 40.9% | 2.36 ms |
| medium | random | 0/50 (0%) | 18.7% | 0.00 ms |
| medium | latent-mpc | 0/50 (0%) | 27.5% | 2.31 ms |
| challenge | random | 0/50 (0%) | 7.1% | 0.00 ms |
| challenge | latent-mpc | 0/50 (0%) | 22.0% | 2.31 ms |

**Reliability gate: NOT MET — experimental**. The gate does not change the reported outcomes. A visually useful push is not counted as task success.

Browser viewport results are in `browser.json`. Portrait/landscape use touch emulation, not a physical Android device. Node WASM timing is not a phone benchmark.

Failure labels are coarse descriptive categories derived from actual contact and achieved coverage. They do not prove the causal reason for each failure.

The original hard-mask/pose-supervised development experiment missed all 50 easy goals; its negative result is retained in `experiment-v1`. Hyperparameter and representation changes used development seeds; the final benchmark uses separately reserved seeds.
