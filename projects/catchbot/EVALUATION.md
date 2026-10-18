# CatchBot evaluation — preliminary synthetic evidence

## What was actually run

Official unmodified Timestral-5M, CPU PyTorch, frozen zero-shot inference. Fifteen independent deterministic synthetic trajectories: three parameter variants each of straight movement with boundary reversals, circular movement, figure eight, repeated reversal and stop/go. Each lasts 12 seconds. There are **zero human trajectories**. Automated Chrome drags are regression fixtures, never labeled human data. No statistical significance or general human-interaction benefit is claimed.

All models received 64 causal samples at 30 Hz, the same 100 ms delay, fixed 300 ms horizon and 10 Hz requests. Each model produced 1,485 predictions; 1,455 have future ground truth within the trace and enter error metrics. Forecast windows overlap and are not independent experimental units. Hyperparameters are fixed in `src/config.js`, not selected per test trajectory.

## Forecast accuracy

Euclidean error in normalized world units (target disk radius 0.87; diameter 1.74). These are pooled forecast-window statistics, not confidence intervals. Medians are workspace-clipped for every model. Raw Timestral marginal quantiles remain unmodified in the compressed artifact.

| Predictor | Mean | Median | p95 | CPU p50 ms | CPU p95 ms |
|---|---:|---:|---:|---:|---:|
| reactive | 0.12886 | 0.12996 | 0.22028 | 0.0009 | 0.0029 |
| velocity | 0.03470 | 0.02273 | 0.12085 | 0.0040 | 0.0101 |
| timestral | 0.02449 | 0.01093 | 0.11783 | 26.7392 | 74.0804 |

Mean errors by movement type (three independent trajectories/type):

| Movement | Reactive | Velocity | Timestral |
|---|---:|---:|---:|
| straight | 0.10130 | 0.01426 | 0.01874 |
| circle | 0.15765 | 0.03416 | 0.01424 |
| figure-eight | 0.17294 | 0.05972 | 0.01952 |
| reversal | 0.16692 | 0.04011 | 0.04491 |
| stop-go | 0.04547 | 0.02522 | 0.02502 |

On this synthetic suite, Timestral has lower mean forecast error than the fixed velocity baseline. That does not establish a benefit on arbitrary live pointer movement. Straight/reversal fixtures include direction changes; the apparent advantage on smooth paths is not evidence of anticipating an unpredictable human decision.

## Shared-robot interception replay

All models use the exact browser FK, IK, fixed positive elbow branch, 60 Hz velocity-limited servo, initial q, capture radius and observation delay. A fixed 2.4 s unscored warm-up is used. Replays continue after catches. An interception counts on contact entry; another cannot count until distance exceeds captureRadius + 0.04. First interception is measured from the end of warm-up. This contact-entry metric can increase with repeated separation, so more entries alone need not mean better sustained pursuit.

| Protocol | Predictor | Contact entries (15 traces) | Mean tip distance | Mean proximity seconds/trace | Mean first catch seconds* |
|---|---|---:|---:|---:|---:|
| algorithm | reactive | 34 | 0.17213 | 5.524 | 1.598 |
| algorithm | velocity | 42 | 0.09322 | 8.246 | 0.949 |
| algorithm | timestral | 45 | 0.08616 | 8.359 | 0.866 |
| deployment | reactive | 33 | 0.17828 | 5.013 | 1.676 |
| deployment | velocity | 46 | 0.09509 | 8.213 | 0.950 |
| deployment | timestral | 54 | 0.09869 | 8.070 | 0.844 |

*Average among traces with a catch; per-trajectory nulls are preserved in `evaluation.json`.

**Algorithm protocol:** zero, equal computation latency. Predictions for the same delayed cutoff become available on the same control tick. No predictor receives current/future target positions.

**Deployment protocol:** a latency-injected replay using actual measured CPU call durations, not a running browser Timestral demonstration. One inference lane; requests arriving while busy are skipped and counted. Results become available at the first control tick after completion. Expired results are rejected; a missing/expired prediction holds the arm. No other model is silently substituted. Per-run holds, misses, stale responses, update latencies and errors are saved. This is a CPU scheduling experiment, not an Android benchmark.

- reactive: 0 busy requests skipped; 0 stale responses rejected; 0 expired-control steps; 0 unavailable steps; baseline-substitution rate 0.
- velocity: 0 busy requests skipped; 0 stale responses rejected; 0 expired-control steps; 0 unavailable steps; baseline-substitution rate 0.
- timestral: 24 busy requests skipped; 4 stale responses rejected; 163 expired-control steps; 0 unavailable steps; baseline-substitution rate 0.

Timestral improves mean tip distance in the equal-latency synthetic comparison. With measured computation latency, its mean tip distance is worse than the velocity baseline in this run, despite more contact entries. Do not reduce these distinct metrics to a general claim that Timestral is a stronger opponent.

The 300 ms horizon is fixed. Even at maximum joint speed, a pi-radian shoulder move takes at least pi/2.2 = 1.43 s; elbow motion can require pi/2.8 = 1.12 s. These are speed-only lower bounds; proportional settling can take longer. The effective forecast lead is only about 167–200 ms, so the predicted point may be obsolete before the robot reaches it. No travel-time-adaptive horizon or MPC was added.

## Uncertainty

The released forecast is `[1,2,9,21]`, with median `[1,2,9]`. For each coordinate, the 5–95% interval is evaluated at the final horizon step. These are marginal intervals and **not a calibrated joint 2D confidence region**. `forecast-metrics.json` saves strict coverage and a labeled 1e-6 numerical-tolerance diagnostic. Constant-coordinate intervals can collapse to float32 values; strict coverage then reflects rounding as well as uncertainty. No joint coverage or calibration claim is made.

## Hardware and runtime

Measured in Docker on Linux x86_64, INTEL(R) XEON(R) PLATINUM 8573C, a shared environment exposing approximately 3 CPU cores and 9.7 GiB memory. PyTorch 2.6.0+cpu, NumPy 2.2.6, Python 3.12.15; one inference thread. Other Docker/build/browser tasks ran concurrently during this measured inference run. Scheduling contention is part of these saved timings; they are not isolated hardware throughput measurements. Model load with a warm local cache took 629.4 ms. The initial network download/cold-cache time was not retained as a reliable measurement.

Latency quantiles use nearest-rank aggregation in the table; NumPy interpolated percentiles in provenance differ slightly. Per-trajectory p95 maxima in `evaluation.json` differ from pooled p95 and must not be confused with it. Raw call times are preserved.

Chromium desktop/phone viewport results and exact browser versions are in `validation/chrome.json`. The three sizes are 1440×900, 390×844 and 844×390. rAF intervals measure scheduling while scripted gestures are active; they are not end-to-end input latency or physical-phone throughput. A final built-route and live-route smoke test checks the fullscreen iframe and blog link separately.

## Browser Timestral gate — unsuccessful

1. PyTorch legacy ONNX exporter, opset 18, full official forecaster including normalization, symmetric averaging and clipping: failed on unsupported `aten::asinh`.
2. Added an exact standard ONNX `Asinh` symbolic (no weights or model changes): next failed on unsupported `aten::cummax`.

Both error records and tracebacks are committed (`onnx-probe.json`, `onnx-probe-mapped.json`). No working graph exists, so numerical parity, ORT Web WASM/Worker latency, browser model memory, model cold loading, physical Android inference and frame-rate impact are **not tested**. The provisional <80 ms warm p95 and ≥30 FPS targets are not claimed as passed for browser ML. The public game offers only real reactive and velocity modes.

## Reproducibility and limitations

- `fixtures.json` and `windows.json`: original trajectory/sample data and exact timestamps.
- `timestral-predictions.json.gz`: all marginal quantiles, projected median targets and measured call times.
- `baseline-predictions.json.gz`: real classical predictions with timestamps and measured call times.
- `evaluation.json`: both control protocols and per-trajectory results.
- `forecast-metrics.json`: pooled and per-type errors, latency and marginal coverage.
- `audit.json`: independent causality/shape/hash checks: 95,040 causal sample checks, zero violations.
- `timestral-provenance.json`, environment lock, Dockerfiles and CHECKPOINTS.md: source, checkpoint, configuration and restoration.

Saved predictions and algorithm replay are deterministic; wall-clock performance and latency-dependent deployment outcomes vary between runs. Human adaptation is absent from fixed traces, so replay is not a human-subject counterfactual. No physical phone was available. Gameplay difficulty has scripted interaction checks but still needs genuine player feedback. The simulator omits torques, inertia, collisions between links and obstacles, and continuous-time swept-contact detection. Very rapid pointer jumps are observed at discrete control steps.

The smallest useful next experiment is collecting consented, locally exported human traces from several independent play sessions, freezing a split, and repeating this fixed-configuration comparison before investing in browser export.

## Saved default-game frame scheduling

| Viewport | Chromium | rAF median ms | rAF p95 ms |
|---|---|---:|---:|
| desktop (1440×900) | 155.0.8059.79 | 16.70 | 16.80 |
| portrait (390×844) | 155.0.8059.79 | 16.70 | 16.70 |
| landscape (844×390) | 155.0.8059.79 | 16.70 | 16.80 |

Measured headless Docker Chromium intervals during automated input on the shared Xeon server. They correspond to roughly 60 Hz median scheduling; they do not establish physical Android FPS. Baseline predictor timings exclude history construction; PyTorch timings include the official forecaster but exclude context array construction.
