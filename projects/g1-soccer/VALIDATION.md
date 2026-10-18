# Validation and limits

Validated 2026-10-18 UTC. Exact inputs, outputs, timings and screenshots are in `results/`.

## Native reference

The digest-pinned Docker build uses Python 3.11, Torch 2.7.1+cpu, MuJoCo 3.10.0, SB3 2.7.0 and NumPy 1.26.4. It reproduced the published **84/100 successes**, mean reward **18.4591081295**, mean episode length **71.83 high-level steps** (14.366 simulated seconds), seeds **1000–1099**.

The selected best checkpoint records **2,363,808** training timesteps; the separately preserved final checkpoint records **3,002,656**. We do not relabel the best checkpoint as the final training step. Success preserves upstream's entry-only 0.5 m circle criterion, with fall/out-of-bounds priority and no added dwell rule.

All initial states/outcomes, three complete 5 Hz trajectories, and 256 walker input/state/output fixtures are saved. Export parity over 184 coach examples and 256 walker examples stayed below `1e-5` for actions and recurrent state. JavaScript tests independently reconstruct observations, coordinate frames, float32 command integration and outcome rules from native states.

## Browser numerical and behavioral agreement

Google Chrome **155.0.8059.84**, ONNX Runtime Web 1.23.2 CPU/WASM and MuJoCo 3.10.0 WASM. The test runs the production worker from native initial states with deterministic inference.

Acceptance thresholds: inference/state errors below `1e-5`, first-step qpos error below `1e-4`, and success-rate difference no greater than ten percentage points.

| Check | Observed result |
|---|---:|
| Native successes | **84/100** |
| Browser successes | **84/100** |
| Episode outcome agreement | **100/100** |
| Coach maximum error | `5.364418e-7` |
| Walker maximum error | `8.344650e-7` |
| Hidden maximum error | `2.384186e-7` |
| Cell maximum error | `4.768372e-7` |
| Largest qpos error after the first 0.2 s, three episodes | `1.013504e-7` |

See `browser-evaluation.json`, `browser-reference-traces.json`, `reference-fixtures.json` and `export-parity.json`. The worker-only harness isolates fidelity from display cost. UI tests additionally run the real scheduler with rendering enabled.

This establishes agreement on the tested distribution, not exact long-horizon identity for every trajectory. These seeds reproduce the upstream evaluation distribution, not a new independent generalization benchmark. No real-robot, sensor-noise, latency or domain-randomization robustness is demonstrated by this integration.

## Actual Chrome interaction tests

A dedicated Chrome computer-agent tool was unavailable. Tests therefore controlled actual Google Chrome through Playwright and Chrome DevTools Protocol touch events; the screenshots were inspected. We do not claim execution through the unavailable computer-agent tool.

The final display geometry is reduced from **503,229 to 67,557 triangles**, separately from the unchanged full-resolution physics/collision meshes. Rendering is capped at 20 Hz and DPR 1 independently of control updates. The offline tool is pinned to fast-simplification 0.1.13 and its output is preserved.

| Layout | Viewport | Local load | Live attempt wall time | Simulated / wall time | Outcome |
|---|---|---:|---:|---:|---|
| Desktop | 1440×900 | 4.03 s | 8.81 s | 0.98× | Success |
| Phone portrait | 412×915, touch/DPR 2 emulation | 3.59 s | 8.71 s | 0.99× | Success |
| Phone landscape | 915×412, touch/DPR 2 emulation | 3.50 s | 8.70 s | 0.99× | Success |

Every live reference attempt reached the target after 8.6 simulated seconds. Local Docker HTTP loading includes differing cache conditions; it is not a public-network download benchmark. The UI report collects its final display label after completion, when it has returned to idle. Running display samples are recorded separately by the built/deployed-route smoke tests. Cloud SwiftShader measurements are not a physical GPU benchmark. Physical-phone and hardware-GPU performance remain unverified.

`chrome-ui.json` records timings, console output, missing responses and every visible control's bounds. Screenshots are `desktop.jpg`, `phone-portrait.jpg` and `phone-landscape.jpg`. All three layouts passed:

- Actual target/ball changes from mouse/touch, ball dragging, and keyboard placement.
- Touch cancellation without accidental placement.
- Pause stopping physics, full-pose/command reset, and subsequent attempt/new-layout operation.
- Learned-policy robot movement and a live successful attempt with rendering enabled.
- Labeled native replay, restart, disabled setup editing during replay, and return to live.
- About opening/closing, controls fitting the viewport, and no horizontal overflow.
- No uncaught page errors or missing runtime responses.

`edge-cases.json` additionally records rotation within one session, touch camera orbit without physics perturbation, keyboard start, About pausing/resuming an attempt, eight repeated replay/live transitions with animation timestamps deliberately lagged by 250 ms, and a deliberately missing model showing a reload path with Start disabled. ORT's cloud `Unknown CPU vendor` warning is retained; inference/parity still pass.

## Reproduction, checkpoints and publication

The image was rebuilt from the committed locks and the native reference restaged from unchanged upstream files plus hash-verified shared Unitree assets. `environment-lock.txt` records installed packages. Docker previews use a lightweight digest-pinned Python image to avoid duplicating the full ML environment per preview container.

The full website is built with the repository's al-folio Docker image. `/soccer/` embeds the demo and the existing demos blog links to it. `tools/check_artifacts.py` checks public runtime, checkpoint and shared asset identities. Original best/final ZIPs retain PPO optimizer state; ONNX exports do not. Original RNG/environment state and walking-training optimizer state were not released, so exact training-stream resumption is not claimed; see `CHECKPOINTS.md`.

Publishing uses the existing GitHub Pages workflow. Production verification is recorded separately after deployment; local results are not presented as deployed-device measurements.

Playback regression: a queued animation timestamp can precede the click that starts replay. Playback clamps elapsed time at zero before selecting a frame, preventing a negative frame index from stopping rendering. Reset/replay transitions also clear speed sampling and update stable control labels only when their content changes. The delayed-timestamp Chrome test exercises this case with real UI interactions.

Final local production check: the full Docker/Jekyll build completed without minifier exceptions; the existing PurgeCSS step and all 16 stable-route checks passed. Published files total approximately 877 MB, below the repository's 1 GB Pages budget. `built-smoke.json` records Chrome loading the actual built iframe route, finding the new blog link alongside CatchBot, and running live physics in all three layouts. Running display samples were 12 fps desktop, 17 fps portrait and 16 fps landscape under cloud SwiftShader.
