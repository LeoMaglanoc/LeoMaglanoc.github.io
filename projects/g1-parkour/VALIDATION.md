# Parkour validation — 2026-10-09

## Outcome

Released PHP student/depth pair, robot XML, collision course and controller contract retained. Static `/parkour/` and the blog demo link implemented. Source/model integration checkpoint: `9c6c43f`. Final source and validation evidence are committed separately after these checks.

The upstream browser source is pinned to `3898564255525f2a72dbbfb1d190b48a230435ab`. Its baseline was installed, tested and built in Docker, then opened in Chrome before restyling. The root upstream lockfile is empty; the app has no lockfile, so the actual dependency resolution used for both baseline and this port is recorded in the new package-lock.json. Baseline serving required JavaScript MIME for `.mjs`. Resolved versions: Three.js 0.181.2, MuJoCo JS 0.0.7 (runtime reports 3.3.8), ONNX Runtime Web 1.30.0, Vite 6.4.4. Native/browser trajectory identity is not claimed.

## Automated evidence

- Released ONNX hashes match the official release manifest, independently checked against `amazon-far/php_parkour`'s release-assets.json. Student-release tag resolves to `bed6a4524d163fab97d755f89e48e5c1d3e19133`.
- All 29 action/joint/actuator mappings, PD gains/action targets, full 140-D input order, both speed modes and every discrete command code pass upstream fixtures. Native action maximum error: **1.49e-7**.
- Native depth fixtures: three cases, maximum error **6.7353e-6**, within upstream 1e-5 tolerance. Orientation, crop, clipping/normalization and antialiased bicubic resize retained.
- Exact source terrain hash retained; all 13 component collider bounds and hand inertias pass. Terrain regeneration in Docker recreates the same include/finish export; no source scene changes resulted.
- Unsupported GPUs without floating-point depth rendering receive an explicit startup error rather than running a blind policy; normal and unsupported startup paths are tested.
- GPU raw-depth comparison between physical and vertex-lit materials: **0 maximum pixel error**. The unlit presentation floor remains excluded from sensor layer 1.
- Desktop and phone integration checks pass: actual MuJoCo time advances, actions produce torques, depth queue fills, held keyboard commands and speed indices match, touch cancellation and blur clear commands, pause freezes time, reset returns to the start, and all controls fit the viewport. Each case physically walks about 2.8 m using the released policy. No page exceptions or asset HTTP errors.
- Touch-camera checks pass: one-finger orbit and pinch zoom change the camera while paused robot qpos remains identical. Five resets retain the same physics model/data, ONNX sessions and scene object count. Evidence: `results/gestures.json`.
- The policy controller, releaseContract and mesh-coordinate helper are byte-identical to the pin. No other demo source/model was modified.

`results/browser.json`, `course.json`, `gestures.json`, `environment.json`, contract logs and screenshots are tracked. GitHub Actions repeats the Docker contract, browser, sensor and resource checks.

## Observed behavior and its limit

Fixed HIGH W input ran **48.26 simulated seconds / 24,130 physics steps**, retaining a seven-step depth queue. The robot cleared the first four obstacles near x=5, 10, 15 and 20 m; recorded pelvis height reached 1.52 m during the taller climbs. It subsequently drifted away from the course, ending at x=66.00, y=33.78 m. This is **not full-course completion**. Steering is needed; no auto-steering or motion scripting was added. The finish indicator now checks the gate corridor, rather than treating any x≥66 position as success.

For this behavioral probe, only display-camera drawing was suppressed to avoid software-rendering cost. Sensor rendering/readback, ONNX inference, PD control and every physics step ran unchanged. Its 32.08 s wall time is an offscreen test measurement, not playable full-view FPS. Successful traversal of all 12 obstacles with manual steering remains unverified.

## Measured performance

These are actual last sampled telemetry values from Docker Chromium 154 / SwiftShader on the laptop, **not measurements from a physical phone**. They fluctuate and are not stable device benchmarks. Full-view software rendering is slow; no realtime guarantee is made. All rates remain 500/50/10 Hz in simulation time.

| Viewport | Dimensions | Render FPS | Policy + depth encoder | Realtime factor |
| --- | --- | --- | --- | --- |
| desktop | 1440×900 | 1.8 render FPS | 11.5 ms policy + encoder | 0.04× realtime |
| phone-portrait | 412×915 | 0.6 render FPS | 8.6 ms policy + encoder | 0.01× realtime |
| phone-landscape | 915×412 | 3.1 render FPS | 11.3 ms policy + encoder | 0.08× realtime |

Native Chrome computer-agent testing also confirmed all three layouts and the About, speed, pause/reset and depth-preview controls. Agent-managed/background Chrome views often sampled around 1 FPS. Performance on a foreground hardware-accelerated browser, Firefox and a physical Galaxy S24 FE remains unverified. Slower devices advance slower simulated time rather than weakening sensor/physics timing.

## Website and regression checks

Docker Jekyll build succeeds. Vite ES modules are preserved through Jekyll's older Terser, and the post-write hook copies underscore-prefixed Vite helper modules that Jekyll otherwise filters. The sealed runtime manifest records **73,343,338 application bytes** and 64 hashed files, including both models and every runtime, scene and notice.

The complete site pipeline includes the existing SLAM build. Route/dependency checks cover 13 public URLs and 44 HTML dependencies. Output asset hashes are compared against the sealed manifest, including WASM, ONNX, XML and `.mjs`/underscore helper files. Chrome opened the Jekyll `/parkour/` deep link. Existing `/g1/` initialized and advanced live telemetry, `/loco-manipulation/` reached its ready state, and `/dexterous-rl/` reached its target state. Their existing ORT CPU-vendor warning is nonfatal; no relevant new runtime exception was observed.

The homepage's four showcase slots are unchanged. The new link is the first entry in the existing AI coding-agent case-study demos list. Pre-existing uncommitted `plan.md` and cache-bust edits were preserved separately.

## Remaining limits

No physical Android or Firefox validation. No proof of identical native/browser full trajectories or successful complete course traversal. Software-rendered full-view performance is low. The official release has no raw training/optimizer checkpoint; retained ONNX exports provide an inference baseline, not resumable training state. License provenance is recorded individually; missing model-specific and later browser-contributor licensing statements are disclosed in THIRD_PARTY_NOTICES.md.
