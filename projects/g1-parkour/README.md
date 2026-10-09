# G1 Parkour Playground

Self-hosted PHP browser simulator at `/parkour/`. This ports the released demonstration; **no policy training or retraining was performed**. Full source lives here; the Vite production build is committed under `assets/interactive/g1-parkour/`. Jekyll's fullscreen iframe follows the site's existing demo pattern. The homepage features it alongside Dexterous Cube Orientation, EuroGuesser AI and RustZero. The demos blog post retains the full archive.

## Reproduce with Docker

```sh
docker compose -f projects/g1-parkour/compose.yaml run --rm tools
docker compose -f projects/g1-parkour/compose.yaml up -d preview
# http://127.0.0.1:8096/assets/interactive/g1-parkour/index.html

docker build -f projects/g1-parkour/Dockerfile.browser -t g1-parkour-browser:2026-10-09 projects/g1-parkour
docker run --rm --network host -v "$PWD":/work g1-parkour-browser:2026-10-09

docker run --rm -v "$PWD":/srv/jekyll -w /srv/jekyll amirpourmand/al-folio:v0.14.7 bundle exec jekyll build
# Existing site preview at http://127.0.0.1:8080/parkour/
```

The tools image uses Node 22, with exact npm resolution in package-lock.json. Preview config supplies JavaScript MIME for `.mjs` and WebAssembly MIME for `.wasm`, matching GitHub Pages. Static hosting requires no Python inference server, WebGPU, account, COOP/COEP, or cloud inference. ONNX uses CPU WASM (one thread without cross-origin isolation). WebGL2 and float render targets/readback are required for depth; missing EXT_color_buffer_float stops startup with an explicit error. First load includes roughly 14 MB of model bytes, MuJoCo and ORT WASM, and robot meshes; see `asset-manifest.json` for exact byte sizes.

`npm test` checks SHA-256 model/terrain identity, asset completeness and the upstream native fixtures: 140-D observations, 29 joint/actuator mappings, PD gains/action parity, all direction codes, depth crop/orientation/bicubic preprocessing, each terrain component and reset during inference. `tests/browser.cjs` checks actual physics progression, pause/reset, keyboard speed/direction encodings, Chrome touch cancellation, layout bounds, model output torques, depth queue and asset/error responses in three viewports. Screenshots and measured results are in `results/`. `tests/gestures.cjs` separately checks real Chrome touch orbit/pinch, physics isolation and reset resource reuse. `tests/course.cjs` compares sensor pixels across materials and probes a long learned-policy rollout with the expensive display camera suppressed; it does not claim a full-course success. Optional `?debug=1` exposes the simulator to integration tests; ordinary URLs do not.

## Sources and checkpoints

- Browser: https://github.com/php-parkour/php-parkour.github.io at **3898564255525f2a72dbbfb1d190b48a230435ab**.
- Research/released ONNX: https://github.com/amazon-far/php_parkour/releases/tag/student-assets-v1 at **bed6a4524d163fab97d755f89e48e5c1d3e19133**.
- Holosoma terrain: **70a344f50de01a77ed3d5ff95127fbb95795c11b**, unchanged OBJ SHA-256 **efb6a1775b04179af0eee50ad6a514a5db12ebad72a51a4992c044a5c4b85cb5**.
- `upstream.json`, `public/php-release/manifest.json`, `asset-manifest.json`, lockfile, native fixtures and Git commits are the reproducible integration checkpoint. See [CHECKPOINTS.md](CHECKPOINTS.md) for how to extend this work.
- Licenses/provenance are individually recorded in `public/THIRD_PARTY_NOTICES.md` and `public/licenses/`, also published beside the app. Upstream browser license text is MIT despite its ISC package metadata. Research and Holosoma are Apache-2.0; Unitree descriptions/meshes carry the BSD notice from pinned Holosoma. Model-specific/contributor notice limitations are explicitly recorded.

The release contains **inference models only**, with export provenance removed, and no raw training checkpoints. These ONNX files reproduce inference but cannot resume the original optimizer/training run. A later training project must obtain the original training checkpoint or start a newly documented run; this integration must not pretend ONNX is an optimizer checkpoint.

## Architecture and preserved contract

User direction → 15-D one-hot command. LOW W/A/Q/D/E use indices 1/2/3/4/5; HIGH uses 6/7/8/9/10. S uses 11 in either mode, idle 0. These are heading selections, not strafing.

Torso-mounted D435i depth: 106×60, 89.5° horizontal FOV, 0.3–3 m range → top-down rows → crop 2 top / 4 each side → antialiased bicubic 87×58 → native normalization → released depth backbone → 32-D latent. Seven control steps of latency are preserved (~140 ms simulated).

Student input order is actions(29), base angular velocity(3), joint position(29), joint velocity(29), torso gravity(3), command(15), latent(32): **140 values**. The released model metadata's legacy observation descriptor must not be used to reorder these. Student → 29 actions → name-mapped PD targets/torques → MuJoCo 3.3.8. Physics timestep .002 s, policy decimation 10, depth decimation 50. The non-convex course is split into the exact original 13 connected components; finish gate remains at x=66, excluded from collision/depth.

`policyController.js`, `releaseContract.js`, robot XML, terrain XML and meshes are preserved from the pin. The local PHP renderer is retained because replacing it with the shared renderer would require separate depth/coordinate/physics validation. Existing dependencies differ between demos; isolation avoids changing them.

Presentation changes: dark G1 shell, an unlit dark floor, vertex-lit robot/course materials, no decorative shadows, optional processed-depth display, compact edge controls and modal details. Floor changes are confined to a layer-0 presentation mesh; the layer-1 sensor still sees exact collision-course geometry. Display DPR remains 1. Camera translates with the pelvis while preserving orbit/zoom. Shift+mouse drag applies upstream physics forces; touch always orbits/zooms.

## Intentional runtime fixes

- Slow frames: upstream sets wall-clock simulation cursor to the current frame when lag exceeds 35 ms. At continuously low FPS that skips every physics step. The adapter instead permits 20 ms of simulated advancement per slow frame, retaining physics dt and inference/depth step cadence. It never changes input resolution or increases policy dt. Realtime factor is measured, not assumed.
- Reset: request is applied at the next serialized frame, after asynchronous inference finishes. MuJoCo state, policy actions/latent queue/held commands and camera reset in place. It returns to course start and retains existing model sessions/scene/GPU resources; upstream reload-at-current-position is not used.
- Frame/model/asset failures are surfaced, missing assets reject startup, module loading is caught, and graphics context loss stops physics. A loading watchdog supplies a retry hint. About pauses the simulation and restores the prior pause state on close. Backgrounding pauses and clears held controls.

## Validation and limits

See [VALIDATION.md](VALIDATION.md) and `results/` for measured evidence. Native fixtures establish observation/action/depth contract parity; they do not prove identical full native/browser trajectories. Browser timing and renderer versions differ. The demo exposes fall/finish state without scripting movements or automatically replacing the learned behavior.

Portrait/landscape checks use Chrome viewport and touch emulation on the laptop. A physical Galaxy S24 FE and Firefox are not available to this workflow; their performance remains unverified. Realtime operation is not guaranteed. No other demo source or model is changed by this project.
