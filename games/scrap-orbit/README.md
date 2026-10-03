# Scrap Orbit

A portrait-first, one-finger orbital salvage game, built in Godot 4.7.2 with the
Compatibility renderer and a single-threaded web export. Play at
https://leonardo-maglanoc.com/scrap-orbit/.

Touch/click the ship, pull backward, and release. Short pulls are often better:
gravity curves your flight. The dotted preview colors dangerous impacts coral
and shows landing/relay targets. Gather diamonds, land gently, reach the relay,
and pick an upgrade. Three shields absorb crashes and return you to your last
landing. Seven upgrades, four authored sectors, and six constrained templates
support endless runs. High score stays on your device. Escape/P pauses, M mutes.

Everything needed to build, export, and validate runs in Docker:

```sh
cd games/scrap-orbit
docker compose build tools
docker compose run --rm tools ./scripts/build_web.sh
docker compose run --rm tools ./scripts/validate.sh
./scripts/test_browser.sh
docker compose up -d preview
```

Open http://localhost:8095/assets/interactive/scrap-orbit/index.html.
Click **Load game**, then **Begin salvage run**. The first load includes the
standard Godot runtime (~38 MB raw); game resources are ~32 KB. No game assets,
audio, or network services are requested during play after loading.

For the full Jekyll preview, run `./scripts/run_local.sh --site` and open
http://localhost:8096/scrap-orbit/. Stop previews with `docker compose down`.

## Design and implementation

- `godot/scripts/orbital_physics.gd`: softened, bounded gravity; 120 Hz fixed
  semi-implicit Euler; swept circle collisions. Preview and flight share the
  exact same integrator and collision/gate rules. Preview has a bounded 6-second
  horizon, extendable through Navigation, and samples eight simulation ticks
  per visible dot. A preview ending in open space does not guarantee escape.
- `sector_generator.gd`: four authored opening layouts and six templates with
  deterministic jitter, conservative spacing, and safe salvage placement.
  `?seed=1701` reproduces a run; seed is omitted from the normal UI.
- `run_state.gd`: score, shields, collect-once salvage, bonuses, and seven upgrades.
- `game.gd`: explicit dock/aim/flight/landing/crash/warp states, touch and mouse
  input, game UI, procedural planets/stars/particles, original synthesized audio.
  The full sector stays visible, reducing aiming and camera surprises on phones.
- `godot/web_shell.html`: lazy load, safe-area layout, WebGL diagnostics,
  pointer/focus/visibility/resize cancellation, accessible state announcements.
  `window.scrapOrbitState` provides read-only telemetry to tests; no gameplay
  mutation or teleport endpoint is exposed.
- `tests/mechanics.gd`: deterministic physics, prediction agreement, swept
  collision, 1,200 generated layouts, and actual scene input/state transitions.
- `tests/routes.gd`: searches real simulated launch/landing routes to establish
  relay reachability for representative authored/template layouts.
- `tests/browser.cjs`: Docker Chromium mouse and CDP touch playthroughs using
  real input, including landing, salvage, cancellation, relay, upgrades, and
  responsive sizing. Screenshots and results go to ignored `artifacts/browser/`.

Edit source and rebuild the committed web export. `games/scrap-orbit/` and
`plan.md` are excluded from Jekyll publishing. The `/scrap-orbit/` site page
embeds the export and is linked from the AI Coding Agent Case Study post.

The visuals and synthesized sound are original. Godot's bundled runtime is MIT
licensed; `ENGINE-LICENSE.txt` and `GODOT-THIRD-PARTY-NOTICES.txt` accompany the
published export. See `VALIDATION.md` for observed tests and device limits.
