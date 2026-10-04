# Validation — 2026-10-03

Verified locally with Godot 4.5.1, Blender 3.4.1, Chromium/Playwright 1.57.0,
and the repository's Jekyll Docker image.

- Full asset regeneration: 18 valid GLBs; original surface textures and synthesized
  audio. CPU-rendered front, quarter and overhead previews were inspected.
- Headless Godot import (including a clean-cache rebuild), main-scene loading and
  single-threaded Web export passed.
- Objective tests passed for all six pickup orders, invalid IDs, duplicate pickups,
  incomplete repairs, and single completion/signal emission.
- Software-rendered desktop and touch startup/movement/pickup smoke tests passed
  with no errors. The full software suite also completed both objectives, although
  it is too slow to be the default CI check.
- Material sharing reduced the world from 81 to 21 distinct materials. The final
  world has 274 mesh surfaces, including the animated fan and relay beacon.
- The GPU-backed browser suite completed the objective on desktop and touch layouts
  with no browser errors. It verified movement, relative mouse look, pointer lock,
  pause/resume, readable notes, wall collision, the workshop ramp, opening/closing
  the door, actual raycast pickups, generator activation, takeoff, and continuing
  to explore after completion. All six landmarks were visited.
- Mobile emulation verified two simultaneous touch contacts (move + look), vertical
  look, stopping on release/cancellation, 844×390 landscape and 390×844 portrait,
  and completion using the touch interaction button. Screenshots were inspected.
- Jekyll built the dedicated `/dustfall-outpost/` page and homepage link, copied
  public game resources, and excluded build sources. A browser check of the
  rendered site verified lazy launch, nested frame startup, mouse capture and
  returning to the top-level homepage.

Reproducible commands are in README.md. Browser evidence is in the ignored
`artifacts/` directory; `artifacts/gpu/browser-results.json` contains the GPU run.
Absolute CDP mouse motion produces pointer-lock warp events, so the mouse-look
assertion sends a relative mouse event through the actual canvas listener. The
component tests use a QA-only pose command between landmarks, then use real
keyboard/touch interactions and Godot raycasts rather than changing objective state.

No physical phone is connected. Actual Android/iPhone performance and subjective
control feel remain unverified. Emulated touch success is not a phone benchmark.
Frame-rate snapshots from concurrent validation processes are also not acceptance
benchmarks; measure the published build on agreed reference devices.

The standard engine runtime is approximately 38 MB raw, plus about 1.2 MB of game
resources. The landing page does not request it until explicit launch. HTTPS (or
localhost) is required for the audio worklet. Threads and cross-origin isolation
headers are not required. Existing website publishing can serve the committed
web export; this work has not been deployed remotely.
