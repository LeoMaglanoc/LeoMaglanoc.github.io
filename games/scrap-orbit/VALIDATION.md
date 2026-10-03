# Validation — 2026-10-03

All engine import/export, mechanics checks, automated browser tests, and Jekyll
builds were run in Docker. The native Chrome session was tested through the
computer-use browser interface.

## Observed passing checks

- Godot 4.7.2 import, single-threaded Compatibility web export, and headless scene
  startup: no script/engine errors.
- 67,886 mechanics assertions: gravity direction, bounded acceleration,
  softening, linear zero-gravity motion, deterministic trajectories, identical
  preview/runtime stepping, swept collision, safe/crash speed classification.
- 1,200 seeded sector layouts: deterministic output, planet separation, sector
  bounds, gate clearance, salvage clearance/bounds.
- Representative opening/template layouts: simulated launch/landing route
  search found a relay route in all ten layouts. This checks representative
  reachability; it does not claim every possible seed has been exhaustively
  solved.
- Scene tests exercise real touch event handling and state transitions:
  cancellation, release, shield consumption, checkpoint recovery, safe landing,
  warp, upgrades, next sector, pause, game over, and instant retry.
- Docker Chromium desktop and simulated touch browser playthroughs: real input
  produces a preview and launch, collects salvage, lands with shields intact,
  reaches the relay, presents three upgrades, and advances sectors while keeping
  score. Touch cancel, mouse Escape, and mid-gesture resize do not launch. Three actual
  hard-impact launches consume shields, end the run, and permit instant retry
  while retaining the best score. No browser errors.
- Portrait 390×844, desktop 1100×900, and landscape 844×390 fit the canvas.
- Native user Chrome computer-use playtest: mouse launch from home to the amber
  planet, salvage collection, safe docking, pause/new run, relay completion with
  score 120, upgrade selection, and sector 2. Phone-size screenshots verified
  portrait framing; browser console showed no errors during that playthrough.
- Full Jekyll build produces `/scrap-orbit/`, its embedded web export, and the
  Scrap Orbit link in `/blog/AI-coding-agent-case-study/`. Game tooling and
  specification are excluded from site output.

Evidence is in ignored `artifacts/`: `validation.log`, `site-build.log`, and
`browser/` screenshots plus `results.json`. Reproduce with the README commands.

## Limits

Touch tests simulate a phone in Chromium. No physical Android/iPhone is attached;
Safari/Firefox, real phone thermals/frame pacing, safe-area hardware, and
subjective one-thumb precision have not been established. Software-rendered
Docker browser performance is not a phone performance benchmark. The trajectory
preview has a bounded horizon; paths beyond its final dot remain unpredicted.
