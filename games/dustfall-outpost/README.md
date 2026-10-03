# Dustfall Outpost

An original browser-playable desert settlement: six landmarks, a workshop interior,
three recoverable ship components, a repair/takeoff sequence, a wandering service
robot, a working generator, a rotating antenna and an overhead courier.

## Play locally

From this directory:

```sh
docker compose build tools
docker compose run --rm tools ./scripts/build_web.sh --assets
./scripts/run_local.sh
```

Open **http://localhost:8093/assets/interactive/dustfall-outpost/**.
The landing page downloads no engine files until **Enter world** is selected.
For the complete portfolio preview, run `./scripts/run_local.sh --site` and open
**http://localhost:8094/dustfall-outpost/**. The repository's Jekyll site exposes
the dedicated page at `/dustfall-outpost/`.
Build tools and source assets are excluded from Jekyll output.

Desktop: WASD, mouse look, E interact, Shift sprint, Esc pause, N notes, M mute. Click Resume to
recapture the mouse. The workshop door has a fixed illuminated control panel.
Mobile: left joystick, right-side drag, Use button. Movement/look pointers are
tracked independently; release, cancellation, pause and window blur clear input.
Touch devices default to light graphics (no directional shadows or dust).
Notes provide component locations, discoveries, and a graphics toggle.
Fullscreen is optional; browsers that do not expose it remain playable inline.
Audio can be muted. Notes and pauses stop player movement.

## Rebuild and validate

```sh
# All commands below run in the pinned Godot 4.5.1 / Debian Blender 3.4.1 image.
docker compose run --rm tools ./scripts/build_assets.sh --previews
docker compose run --rm tools ./scripts/build_web.sh
docker compose run --rm tools ./scripts/validate.sh
./scripts/test_browser.sh  # Fast software-rendered desktop/touch smoke test
# Full Linux hardware-accelerated Chromium playthrough and visual evidence:
./scripts/test_browser.sh --gpu
```

`validate.sh` regenerates assets and original offline audio, imports the Godot
project, exports a single-threaded Compatibility build, checks the GLB headers and
expected files, tests objective state, and loads the main scene headlessly.
The full browser suite (`--gpu`) launches the actual web export through the landing page, checks
keyboard movement, relative mouse events and capture, building collision, the workshop threshold,
door opening/closing, pickup raycasts and ship completion. It tests two simultaneous
CDP touch contacts, vertical camera drag, release/cancel stopping, portrait and
landscape controls, touch interaction, and continuing after completion. Results and
screenshots are written to `artifacts/`. CI uses `tests/smoke.cjs`, a small-render
software test of startup, actual keyboard/two-finger movement, stopping and raycast
pickup. The full suite waits for simulated physics steps rather than wall-clock
movement durations, and remains available with `node tests/browser.cjs`.

Browser tests use localhost (secure context). For remote hosting use HTTPS; the
Web Audio worklet needs a secure context even though threads are disabled.
Software-rendered browser frame rates are **not** device-performance benchmarks.
Real Android Chrome and iPhone Safari playthroughs are still required to establish
phone performance and subjective control feel; no physical phone is connected here.

A test-only pose command and position telemetry are gated behind `?qa=1`. Tests
use it to move between landmarks, then use real keyboard/touch interaction and
Godot's raycast. They do not call collect/repair directly. CDP absolute mouse motion causes pointer-lock warp events, so the mouse-look assertion dispatches a relative mouse event through the actual canvas listener. Normal sessions omit the
pose endpoint. `?touch=1` can force the touch UI for manual desktop inspection.

## Source of truth

- `blender/common/kit.py`: palette, original small baked wear textures, geometry,
  coordinate conversion, GLB export and material-based mesh merging.
- `blender/generate.py`: deterministic modular asset definitions, seed 37.
- `blender/render_preview.py`: front/quarter/overview CPU-rendered previews for any
  generated asset (`-- ship workshop stall robot`, for example).
- `godot/scripts/world.gd`: level composition, simple collision proxies, lighting,
  landmarks and ambient movement. It instances reusable GLBs rather than a single
  environment mesh and shares matching palette materials across the entire kit. Unit convention: one Blender/Godot unit is one meter.
- Separate scripts own player physics, centralized interaction, objective state,
  interactables, robot behavior and browser orchestration.
- `godot/web_shell.html`: source browser UI, HUD and multi-pointer touch controls.
  Edit this source rather than the exported HTML.
- `scripts/generate_audio.py`: original deterministic wind, hum and transient WAVs.

Generated `.glb` and audio files plus the deployable export are committed so the
existing static-site deployment can publish without installing Blender or Godot.
`.blend` builds, previews, import caches and test artifacts are ignored. Change
an asset generator and rebuild instead of editing generated assets by hand.
The standard Godot WASM runtime dominates download size (about 38 MB raw); game
resources are much smaller. A custom engine-template build is deferred until
measured loading requirements justify its maintenance cost.

All game designs, geometry, surface textures and audio are original. Godot and
Blender retain their respective upstream licenses; the bundled Godot runtime is
MIT licensed (see the published `ENGINE-LICENSE.txt` and
`GODOT-THIRD-PARTY-NOTICES.txt`). No franchise assets are used.

For material/surface counts: `docker compose run --rm tools godot --headless --path godot --script ../tests/profile.gd`.

See `VALIDATION.md` for the observed checks and their limits.
