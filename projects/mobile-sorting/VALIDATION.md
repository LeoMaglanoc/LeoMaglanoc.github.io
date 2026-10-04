# Validation — 3 October 2026

Development, model preparation, native/WASM checks, formatting and Jekyll builds
used Docker. Browser tests connected from the Docker harness to this laptop's
installed **Google Chrome 154.0.8037.57**, running visibly with a separate test
profile. These are real Chrome tests, not a substitute browser executable.

## Endurance and contact physics

The actual WASM simulation/controller ran for 5,500 simulated seconds:

| Seed      | Simulated seconds |  Sorted |   Blue |    Red | Retries | Drops | Maximum active bodies |
| --------- | ----------------: | ------: | -----: | -----: | ------: | ----: | --------------------: |
| 731       |             4,200 |     102 |     54 |     48 |       1 |     0 |                     5 |
| 17        |               650 |      16 |      7 |      9 |       0 |     0 |                     5 |
| 2026      |               650 |      16 |      9 |      7 |       0 |     0 |                     5 |
| **Total** |         **5,500** | **134** | **70** | **64** |   **1** | **0** |                 **5** |

The test checked finite state/velocity values, fixed model dimensions, bounded
history and object counts, continued scoring, and held-object proximity during
2,555 sampled transport checks. It failed if scoring stopped for 180 simulated
seconds. One attempt recovered by recycling; no physical slip was observed in
these endurance runs. This demonstrates sustained operation, not a guarantee
against every possible contact or browser failure.

Other passing WASM checks cover:

- 100 deterministic spawn seeds, separation, table bounds and both object classes.
- Actual finger closure against an object, physical lift, wheel-driven turning
  and translation while carrying, and settled placement in the correct bin.
- Deliberately forced failed table grasp, safe retreat, and continued sorting.
- Deliberately forced carried-object drop, recycling and no false success count.
- Reset during carrying, restoring the complete robot/pool/FSM/counters.
- Deferred failed-object reselection, preventing starvation behind newly spawned
  objects.

Native MuJoCo 3.3.7 independently loaded the derivative, checked its geometry,
dimensions and timestep, and stepped the model without nonfinite state. WASM
reports MuJoCo 3.12.0. The integration/endurance behavior is validated in WASM;
native checks do not claim cross-version numerical parity.

## Chrome and mobile UI

Passing viewport tests: **1440 × 900**, **390 × 844** and **844 × 390**. The mobile
contexts used touch input and DPR 2, with the renderer applying its own DPR cap.

Startup, pause/resume, reset, mouse/touch orbit, scroll/pinch zoom, view reset,
explanation and debug controls all passed. No horizontal overflow, offscreen
footer buttons, uncaught page errors or external runtime requests were observed.
Pause/reset hit targets were 44 CSS px high. Screenshots were visually inspected.
The browser ran three accelerated real-physics sorts (both destinations) with
zero retries/drops during that check.

The **built Jekyll `/mobile-sorting/` iframe** passed desktop and portrait checks,
including actual startup, three sorts, full-viewport bounds and fullscreen
entry/exit inside the iframe. Local tests/tooling reports are excluded from the
published site; vendored rendering modules and robot meshes remain present.

A separate visible Chrome run at normal speed completed one physical sort
without errors: 40.1 simulated seconds elapsed over approximately 40 seconds of
observation. Eight periodic samples recorded about 60 animation callbacks/sec,
1.5–4.6 ms of smoothed physics/controller work per callback and zero discarded
backlog events. Rendering is separately capped at 30 fps. Short viewport checks
while other tests/builds were running observed approximately 50–60 animation
callbacks/sec. These measurements describe this laptop, not phone hardware.

## Build and reproducibility

- Full Docker Jekyll build passed, including the homepage link and fullscreen route.
- Newly added source files were formatted with the repository's Prettier configuration.
- `git diff --check` passed.
- Regenerating the pinned robot reproduced the same XML as the tested build;
  decimated STL assets total **1,568,530 bytes**.
- Raw local reports/screenshots are retained under ignored `test-results/`:
  `soak.json`, `results.json`, `built-route.json`, `live-chrome.json` and PNGs.
  Docker reproduction commands are in `README.md`.

Physical Android/iPhone devices and Safari were not tested. Touch emulation
verifies layout and gestures; it does not establish phone CPU/GPU performance.
