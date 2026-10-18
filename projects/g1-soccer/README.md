# G1 Soccer Lab

Interactive pretrained soccer dribbling at **[/soccer/](https://leonardo-maglanoc.com/soccer/)**. Click/tap the field or top-down map to place a target. Start lets the learned controller attempt the task. Select Ball to drag/reposition it while paused. Setup edits restart the attempt; Reset restores the edited setup, and New layout advances through 100 seeded layouts. Camera mode enables orbit/zoom. A focused field accepts arrow keys for placement and Enter for start/pause.

This is a browser port of SoccerDribble, not newly trained football skills. The robot primarily pushes the ball through walking contact. Both original policies are retained; neither ball motion nor robot motion is scripted. Watch reference is explicitly labeled recorded playback and uses native qpos traces, not live inference.

## Verified behavior

- Native Docker evaluation: **84/100 successes**, mean reward **18.459108**, seeds 1000–1099.
- Chrome/WASM evaluation: **84/100 successes**, **100/100 outcome agreement** with the native reference on those same layouts.
- Browser ONNX errors against native traces: coach ≤ `5.37e-7`, walker ≤ `8.35e-7`; hidden/cell state also within `1e-5`.
- First 0.2-second state comparisons across three episodes: maximum qpos error `1.014e-7`.
- These are fixed-seed simulation checks using the upstream evaluation distribution, not an independent benchmark or physical-robot validation. See [VALIDATION.md](VALIDATION.md) and the machine-readable files in `results/` for browser/UI measurements and limitations.

## Reproduce in Docker

Run all commands from the website repository root. Docker and Compose are required. The Python base image is digest-pinned; native Python packages are pinned in `requirements.lock`; the display-only tool is pinned in `display-requirements.lock`.

```sh
# Default CA bundle works on ordinary Linux. In a managed environment, use its
# combined trust bundle; keep TLS verification enabled.
export SOCCER_CA_BUNDLE=/etc/ssl/certs/ca-certificates.crt
docker compose -f projects/g1-soccer/compose.yaml build tools

# Reproduce native evaluation, export both policies, and validate export parity.
docker compose -f projects/g1-soccer/compose.yaml run --rm tools

# Run checks and synchronize the exact public runtime files.
node --test projects/g1-soccer/tests/contract.test.js
python3 scripts/publish-project-assets.py --site-only
docker compose -f projects/g1-soccer/compose.yaml up -d preview
# Open http://127.0.0.1:8097/assets/interactive/g1-soccer/index.html
```

`tools/prepare_reference.py` stages the unchanged upstream environment under `/tmp`, links the hash-verified existing Unitree assets into the original directory layout, and points it at the original coach checkpoint. It never changes another demo's model or scene. Native stepping does not require a GPU, display server, or rendering libraries.

`tools/reference.py` saves all 100 initial states and outcomes, three complete 5 Hz trajectories, 256 recurrent walker input/output fixtures, and the serialized configuration. `tools/export_models.py` regenerates the inference models and browser layout/replay assets, checking deterministic actions and recurrent outputs against those fixtures. ONNX exports use batch size 1 and opset 17. `tools/visual_meshes.py` regenerates the display-only geometry; it runs as the final reproduction step. Its triangle target is best effort per mesh, preserving topology where further reduction is unavailable.

Docker Compose uses UID/GID 1000 so mounted outputs remain editable in this workspace. On another machine, override `user` to the local UID/GID if necessary. The CA is mounted as a BuildKit secret and does not enter the image layers. The preview uses a separate lightweight, digest-pinned Python image; it does not duplicate the full ML environment.

## Test in Google Chrome

The browser tests use Playwright to control **Google Chrome**, including CDP touch events. Install the pinned Node dependency and select an installed Chrome executable:

```sh
npm ci --prefix projects/g1-soccer
export CHROME_PATH=/usr/bin/google-chrome
# On macOS, select the Google Chrome application binary instead.
node projects/g1-soccer/tests/evaluate-browser.cjs
node projects/g1-soccer/tests/browser.cjs
node projects/g1-soccer/tests/edge-cases.cjs
```

After a full Jekyll build, use the built-page preview to verify the actual route and blog link:

```sh
docker compose -f projects/g1-soccer/compose.yaml up -d built-preview
SOCCER_ORIGIN=http://127.0.0.1:8098 node projects/g1-soccer/tests/production.cjs
```

The same test accepts `SOCCER_ORIGIN=https://leomaglanoc.github.io` after deployment. Set `CHROME_PATH` as above. HTTPS testing preserves normal certificate verification and uses the configured session proxy when present.

Verify the deployed models, engine and scene data separately:

```sh
python3 projects/g1-soccer/tools/verify_public_assets.py --origin https://leonardo-maglanoc.com
```

The site minifies JSON/XML; this verifier checks their parsed/canonical data and requires exact binary identity for ONNX/WASM. Public verification results and the successful Pages workflow are linked in `VALIDATION.md`.


Set `SOCCER_ORIGIN` to test another origin. The evaluation harness loads the production worker without a display renderer to isolate numerical/behavioral parity. UI tests separately run actual live episodes with rendering and scheduling enabled. `?debug=1` exposes `window.soccerLab` for those integration tests; ordinary URLs do not.

Chrome tests cover 1440×900 desktop, 412×915 phone portrait, and 915×412 phone landscape. Phone tests emulate viewport, DPR and touch; they are not physical-device measurements. The test Chrome uses SwiftShader in this cloud workspace, so measured rendering FPS is not a phone GPU benchmark. Dedicated Chrome computer-agent access was unavailable; testing used actual Google Chrome automation and inspected screenshots instead.

## Architecture and preserved contract

- `src/contract.js`: observation math, float32 command integration, and outcome rules.
- `src/simulation.js`: MuJoCo state, named joint mapping, torque control, and synchronized inference.
- `src/worker.js`: serialized requests and a fixed-step live scheduler. Physics and inference stay off the UI thread.
- `src/model.js`: model loading with bounded parallel mesh downloads and retry handling.
- `src/main.js`: controls, telemetry, target/ball placement, background pausing, and native replay.
- `src/renderer.js`: presentation adapter over the website's shared MuJoCo/Three.js renderer. Field/target colors and target-cylinder scale are presentation-only; collision geometry is unchanged. Display meshes are separately decimated from 503,229 to 67,557 triangles, using the compiled native mesh coordinate frame. The collision/physics meshes remain full-resolution and unchanged. Rendering is capped at 20 Hz and DPR 1 independently of control rates.

Physics is MuJoCo **3.10.0** in both Python and WASM, with the upstream XML, collision mesh data, friction, ball mass/radius and solver options. `dt = 0.002 s`, integrator `implicitfast`, elliptic friction cone, gravity `(0,0,-9.81)`. Ball radius is 0.11 m; mass 0.43 kg. Field is 8×6 m; the physical plane remains infinite and the software checks ball bounds.

The 13-D coach input is, in order: robot-to-ball body-frame xy (2), robot-to-target body-frame xy (2), robot-to-ball distance (1), ball-to-target distance (1), body-frame robot xy velocity (2), sin/cos world yaw (2), previous integrated command (3). The `[64,64]` tanh actor returns three clipped action values. At 5 Hz, multiply by `(0.2,0.1,0.1)`, add to the float32 command, then clamp to ±`(1,0.5,0.5)`.

The 47-D walker input is angular velocity×0.25 (3), projected gravity (3), command×`(2,2,0.25)` (3), joint-position error (12), joint velocity×0.05 (12), previous action (12), gait sin/cos (2). Gait period is 0.8 s. Joint order is left hip pitch/roll/yaw, knee, ankle pitch/roll, then the same six on the right. The actor is LSTM(47,64) → Linear(64,32) → ELU → Linear(32,12), carrying explicit hidden and cell tensors of shape `[1,1,64]`.

The walker updates **after** every ten physics steps, matching upstream; its new action controls the following interval. Joint targets are float32 `default + action×0.25`. Gains/defaults are in `config.json`. PD torque is recomputed every physics step. The coach updates before each 100-step block. No policy tick is skipped or run with an uncompleted asynchronous action. Slow devices advance less simulated time rather than enlarging the physics timestep; backlog is bounded at 60 ms. Reset clears simulator state, command, actions, targets, step count and both recurrent tensors. Requests serialize against in-flight inference.

Every 0.2 simulated seconds, termination checks preserve upstream priority: pelvis below 0.5 m → fall; ball outside ±4/±3 m → out of bounds; ball distance below 0.5 m → success; otherwise 20 s → timeout. Success does not require stopping or dwelling in the target. No stricter criterion is presented as reproducing the original policy.

## Assets, publishing and provenance

`upstream/` contains unchanged native source and scene files from the pinned soccer repository. Its README documents a walking file that is missing from that commit; this port explicitly supplies the official Unitree file and verifies identity with the website's existing G1 checkpoint. All 27 shared STL files match the soccer repository byte for byte. Source commits, checkpoint steps and hashes are in `provenance.json`; public runtime/dependency hashes are in `asset-hashes.json`; license texts are in `licenses/` and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

Public files are enumerated under `projects/g1-soccer` in `scripts/project-assets.json` and copied to `assets/interactive/g1-soccer/`. Original training archives, Python tooling and test evidence stay in `projects/`, excluded from the published site. Shared dependencies remain at the existing G1, mobile-sorting, language-vision, euroguessr and shared renderer asset paths. These retained dependency paths are part of the deployment contract.

`_pages/soccer.md` and `_layouts/soccer-fullscreen.html` supply `/soccer/`. The existing demos blog post includes the new link. Pushes to `main` use the repository's GitHub Pages workflow; there is no additional hosting service.

See [CHECKPOINTS.md](CHECKPOINTS.md) to continue model work. No training or fine-tuning was performed during this port.
