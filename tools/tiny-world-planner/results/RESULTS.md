# Measured release results

The release remains **experimental**. Perception is explicitly pose-supervised, with geometric priors; no privileged simulator state enters the deployed planner.

Dynamics dataset: 1400 episodes × 60 actions. True contact fraction 38.7%. Encoder pretraining used a separate 700×80 dataset.

## Held-out image-conditioned prediction

| Horizon | Latent MSE ± SD | Static MSE | Position error (units) | Angle error (rad) |
|---:|---:|---:|---:|---:|
| 1 | 0.00073 ± 0.00584 | 0.00672 | 0.0299 | 0.0191 |
| 3 | 0.00490 ± 0.03071 | 0.04378 | 0.0711 | 0.0451 |
| 5 | 0.01144 ± 0.06885 | 0.09606 | 0.1085 | 0.0687 |
| 8 | 0.02334 ± 0.11805 | 0.18397 | 0.1619 | 0.1022 |
| 16 | 0.06075 ± 0.21079 | 0.43732 | 0.2906 | 0.1854 |

## Reserved planning benchmark

50 seeds 930000–930049 per difficulty; paired random actions and neural MPC; 100-action budget. Success requires ≥95% actual geometric coverage for three consecutive actions.

| Difficulty | Method | Success | Mean final coverage | Mean CEM time |
|---|---|---:|---:|---:|
| easy | random | 0/50 | 33.2% | 0.0 ms |
| easy | latent-mpc | 3/50 | 85.0% | 49.4 ms |
| medium | random | 0/50 | 19.5% | 0.0 ms |
| medium | latent-mpc | 2/50 | 76.0% | 49.1 ms |
| challenge | random | 0/50 | 7.4% | 0.0 ms |
| challenge | latent-mpc | 2/50 | 81.9% | 49.1 ms |

**Reliability gate: NOT MET.** 3/50 easy successes; target was ≥25/50. These results must not be presented as a reliable controller.

Timing above is Node WASM CEM under concurrent evaluation load, excluding observation encoding and diagnostic decoding. Browser measurements are separate in `browser.json`; mobile viewports are emulated, not physical Android timings.

Default seed 902005 is a selected development demonstration, not a final benchmark seed. It succeeds through fresh neural CEM execution, not a replay or scripted controller. Goal edits and disturbances can fail.

The original release is retained under `original-release/`. A paired original-controller evaluation on the new easy seeds is under `original-on-new-seeds/`. Privileged oracle diagnostics remain offline under tools; none is imported or substituted by the website.

Development included negative short/long horizon, online residual, and introductory-scene experiments. They are not the final held-out benchmark.
