# Validation — 3 October 2026

## Observed results

- Docker builds with official Godot 4.7.2 and matching single-threaded web
  templates. Import and export logs are checked for parser/script/engine errors.
- Engine suite: **1,121 passing checks** covering deterministic terrain, bounded
  storage, foundation protection, chunk-boundary edits, delta replay, exact ray
  traversal, mesh winding, actual terrain collision, walking, jumping and landing,
  production break/place behavior, twelve robots, wave animation, changed-support
  avoidance, fallen robot recovery, wandering/idling and safe saved positions.
- Docker Chromium, desktop 1280×720: movement, jump, break/place, palette and
  selection, action/camera input separation, robot greetings, refresh persistence,
  cancel/confirm reset, 44 px targets and fullscreen entry/exit all pass.
- Docker Chromium touch, landscape 844×390: the same checks plus **three real CDP
  touch pointers** for simultaneous movement, looking and jumping. Released
  joystick stops movement. Portrait 390×844 shows the rotation prompt; returning
  to landscape works. The hotbar fits 667×375. No page scrolling during play.
- Full Jekyll build succeeds. Source/tooling and `plan.md` are excluded. The
  `/block-world/` page embeds the export with fullscreen permission; the case
  study blogpost links to it.
- Integrated site browser smoke: landscape title card fits the viewport, the
  iframe loads and plays, child/parent fullscreen entry and exit succeed, reset
  cancellation works, and the blog link resolves to `/block-world/`.
- Chrome computer use: inspected title/menu, rendered terrain and robots, edited
  blocks, used palette selection and placement, inspected landscape target sizes,
  pause/reset confirmation and the integrated website iframe. The controlled
  Chrome session denied fullscreen with `TypeError: not granted`; the fallback
  message works. Normal trusted browser clicks in the automated suites successfully
  entered and exited fullscreen, both directly and through the site iframe.
- Automated suites report **zero game console/page errors**. Formatting and
  `git diff --check` are clean for the new/modified files.

## Performance and coverage limits

The test environment uses software-rendered WebGL for automated browser tests.
Observed initial gameplay telemetry was 7 FPS (desktop) and 9 FPS (phone viewport)
in the final full run; these are **not physical-phone measurements** and do not
establish the 30/60 FPS targets. Four chunks generate per loading frame; terrain
uses an unshaded atlas with baked directional shading, fog/distance culling and
one static collider per chunk. Standard/Eco render at 75%/50% resolution.

No physical Android or iPhone was connected, and Safari/iOS was not tested.
Touch emulation verifies input/layout, not thermal behavior, GPU performance,
browser chrome, actual safe-area cutouts or device-specific orientation APIs.
Storage availability and fullscreen depend on browser capabilities/settings.

## Reproduce

```sh
docker compose build tools
docker compose run --rm tools ./scripts/build_web.sh
docker compose run --rm tools ./scripts/validate.sh
./scripts/test_browser.sh
./scripts/run_local.sh --site
docker compose run --rm browser node tests/site.cjs
```

Run from `games/block-world/`. Screenshots and detailed browser results are written
under ignored `artifacts/browser/`. All browser gameplay checks use real input;
telemetry is read-only. No browser teleport, placement or state mutation is used.
