# CatchBot implementation report

## Delivery

Public route: https://leonardo-maglanoc.com/catchbot/

Blog demo list: https://leonardo-maglanoc.com/blog/AI-coding-agent-case-study/

Implementation source commit: `9ffb98f1224f220da9b7a6439e9550700fcdfd2c`.
GitHub deployment: https://github.com/LeoMaglanoc/LeoMaglanoc.github.io/actions/runs/39120952891

**Deployed and verified.** GitHub Pages run 39120952891 completed successfully.
The live route and existing blog demo link pass desktop, portrait and landscape
Chrome checks with zero console errors. All 11 served game files match the tested
minified build by SHA-256 (28,962 bytes total for those inner game files).
See `validation/github-deployment.json`, `chrome-live.json` and `live-runtime.json`.

## Implemented

Single-screen Canvas 2D, desktop mouse and one captured touch pointer, a bounded
normalized workspace, warm-up and 20-second scored evasion, actual-tip catches,
pause on release/interruption/suspension, immediate replay, controller selection,
a prediction ghost, local JSON trace export and deterministic same-trace comparison.
No framework, runtime CDN, backend, camera, login, GPU or model download is needed.
The target's visual halo remains at least 23 CSS pixels in radius around a finger.

Kinematic 2R arm: exact FK, analytic positive-elbow IK, reachability projection,
continuous shoulder angle, elbow [0,pi], proportional joint velocity control,
2.2/2.8 rad/s limits, 60 Hz stepping and identical collision/robot parameters
across predictors. This is not torque dynamics. Pointer timestamps are mapped to
active simulation time; between-frame observations queue until their actual step.

Reactive persistence and robust constant velocity use identical causal 30 Hz
resampling, 64 samples and a 100 ms delayed cutoff. Velocity is the median of all
pairwise slopes over the last seven samples. The horizon is a fixed 300 ms from
the cutoff, approximately 167–200 ms ahead of the current simulation. Async
request/epoch checks reject stale or reset-era results. Failure means a recorded
hold, never a mislabeled baseline substitution.

## Exact files

[validation/changed-files.txt](validation/changed-files.txt) lists every added or
modified repository path relative to the pre-task commit `8258c4d`. The source
folder is `projects/catchbot/`; generated runtime files live in
`assets/interactive/catchbot/`. Integration changes are the new fullscreen
layout/page, project manifest/route checker, demos blog link, root README and a
CatchBot test step in the existing deploy workflow. Other demos' source and
shared styles are unchanged. The root `plan.md` was empty and was preserved.

[validation/file-manifest.json](validation/file-manifest.json) supplies SHA-256
checksums for source, results, integration and generated files. The build
transform record separately hashes Jekyll-minified JS/CSS: canonical and copied
source match byte-for-byte; built files legitimately differ after minification.
Both unminified and minified runtimes received complete Chrome interaction tests.

## Verification

[validation/commands.md](validation/commands.md) records exact commands and pass,
fail or corrected outcomes. Raw logs, Chrome JSON and screenshots are alongside it.

- Docker images: official CPU model experiment, real Chromium browser checks and
  complete Ruby/Jekyll site build, with pinned base digests and TLS trust.
- 29 CatchBot mathematical, causal-sampling, lifecycle, fixed-step and async tests
  pass in Docker. Existing Portal tests and SLAM test/build/asset checks pass.
- Independent audit: 95,040 causal sample checks, official quantile dimensions,
  ordering/finiteness, median projection and input hashes: zero violations.
- Publisher checks all 657 runtime files; active-site publication consistency
  also passes. The site's route/dependency checker passes 15 routes and 52 HTML
  dependencies. Final local site: 861,032,471 bytes, below the 1 GB limit.
- Real headless Chromium, Docker, 1440×900 desktop, 390×844 portrait, 844×390
  landscape. Mouse and CDP touch dragging, start/warm-up, online prediction,
  release pause, no scroll, cancellation/lost capture, visibility handler,
  restarts, reset-on-strategy-change, resize, replay and console checks pass.
- Fullscreen built route and existing blog link pass separately at all three sizes.
  A 320×568 overflow smoke check also passes.

A Chrome computer-use agent and physical phone were not exposed. Playwright/CDP
controlled actual Chromium instead. Phone viewport/touch emulation is not a
physical Android test. Visibility injection is a handler test; rAF scheduling is
not hardware input-to-display latency.

## Measured runtime

Shared Linux x86_64 Docker environment, Intel Xeon Platinum 8573C, approximately
three allocated CPU cores and 9.7 GiB memory. Python and browser work ran on the
same shared machine; the inference run included other concurrent build/browser
work. This is not an isolated hardware throughput benchmark.

| Built-game viewport | Chromium | rAF median ms | rAF p95 ms |
|---|---|---:|---:|
| desktop | 155.0.8059.79 | 16.70 | 16.70 |
| portrait | 155.0.8059.79 | 16.70 | 16.80 |
| landscape | 155.0.8059.79 | 16.70 | 16.70 |

These intervals show approximately 60 Hz median scheduling in the tested server
browser. No physical-phone FPS, browser model memory or model loading claim is made.

## Model and controller results

Official unmodified frozen Timestral-5M ran in CPU PyTorch with pinned source and
checkpoint revisions. Fifteen 12-second synthetic trajectories, three variants
of each movement type. Zero human traces. There are 1,485 forecasts/model, of
which 1,455 have future truth for error scoring. Overlapping windows are not
independent experimental units. Full per-type and per-trajectory measurements,
raw quantiles and exact timestamps are retained in `results/`.

| Forecast model | Mean 300 ms error | Median | p95 | Inference p50 ms | p95 ms |
|---|---:|---:|---:|---:|---:|
| reactive | 0.12886 | 0.12996 | 0.22028 | 0.0009 | 0.0029 |
| velocity | 0.03470 | 0.02273 | 0.12085 | 0.0040 | 0.0101 |
| timestral | 0.02449 | 0.01093 | 0.11783 | 26.7392 | 74.0804 |

Errors are normalized world units (workspace diameter 1.74), not pixels or meters.

| Protocol | Model | Contact entries | Mean tip distance |
|---|---|---:|---:|
| algorithm | reactive | 34 | 0.17213 |
| algorithm | velocity | 42 | 0.09322 |
| algorithm | timestral | 45 | 0.08616 |
| deployment | reactive | 33 | 0.17828 |
| deployment | velocity | 46 | 0.09509 |
| deployment | timestral | 54 | 0.09869 |

Algorithm replay equalizes computation latency to zero. Deployment replay injects
actual measured CPU call times on one inference lane, counts busy requests and
expired results, and holds without model substitution. Contact entries count
again only after separation beyond captureRadius+0.04; more entries alone do not
mean better sustained tracking. First-catch times, proximity, latencies, misses,
holds and marginal quantile coverage are saved. Coordinate-wise intervals are
not a calibrated joint 2D confidence region.

Timestral improves forecast error and equal-latency tip distance on this
synthetic suite. With measured latency, its mean tip distance is worse than
constant velocity in this run. This does not prove a human gameplay benefit;
humans adapt to the robot, and fixed-trace replay is not a human counterfactual.

## Timestral browser status: unsuccessful

The official PyTorch reference works. Full-forecaster ONNX export failed on
unsupported `aten::asinh`; an exact ONNX Asinh symbolic then reached unsupported
`aten::cummax`. Both failed attempts and tracebacks are committed. No approximation
was substituted and no Timestral browser button was shipped. ONNX parity, ORT
Web WASM/Worker operation, browser memory/cold-load behavior and physical Android
inference are unverified. The proposed <80 ms browser p95 target is not claimed
as passed by the native CPU result.

## Checkpoints and remaining risks

[CHECKPOINTS.md](CHECKPOINTS.md) documents baseline/research/final tags, official
source/checkpoint revisions and hashes, environment lock, raw prediction artifacts,
exact restoration commands and future experiment boundaries. No training occurred,
so there is no optimizer state or invented fine-tuning checkpoint. Frozen model
weights remain in the external cache and can be restored by immutable public
revision and verified hash. [REVIEW.md](REVIEW.md) records the skeptical review
and timing/evaluation corrections made before completion.

Limits: synthetic-only evidence, no physical Android, no browser ML, scripted
rather than human difficulty tuning, discrete-time contact checks, no torques,
inertia, obstacles or self-collision dynamics. The fixed horizon can be much
shorter than arm travel time; no horizon optimization on test paths was performed.

The smallest useful next improvement is collecting consented local human traces
from several independent sessions, freezing a split and repeating this exact
baseline comparison before spending more effort on browser model export.

The final documentation/evidence-only commit uses `[skip ci]` to avoid redeploying unchanged game files. The deployed implementation remains source commit `9ffb98f`; the final `catchbot-mvp-2026-10-18` tag also retains live verification, complete path inventory and checksums. No product source changes follow the successful deployment.
