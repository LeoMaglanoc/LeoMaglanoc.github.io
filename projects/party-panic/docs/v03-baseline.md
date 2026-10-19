# Party Panic v0.3 baseline

Starting/rollback commit: `43cb574b1fb3e6d55fe0187f90d03027cbaafdc5` on main.
Clean checkout; no AGENTS.md found. Scope confined to this project. User requests
commits and push directly to main. Existing stack, transport and course retained.

## Reproduction

`npm ci`, `npm run check`, `npm run test:e2e` run before gameplay edits.
Raw output: `docs/evidence/v03-baseline/`. `tools/v02-movement.mjs v03-before`
ran against unchanged Vite on port 5174, actual PlayCanvas/Ammo at fixed 60 Hz,
ordinary inputs, no position or progress mutation. Raw traces: `movement.json`.
Baseline browser suite outcome is recorded in v03-validation.md.

| Deterministic measurement | Before |
| --- | ---: |
| Speed (cardinal/diagonal) | 2.8000 / 2.8000 units/s |
| Ground acceleration / braking (source) | 36 / 42 units/s² |
| Time to speed (both) | 83.3 ms |
| Time to stop (both) | 66.7 ms |
| Braking distance (both) | 0.11667 units |
| Jump rise | 1.5000 units |
| Flight to landing threshold | 833.3 ms |
| Rest-start jump range | 1.99916 units |
| First simulated lift | 33.3 ms (not browser input latency) |
| Buffer / coyote windows (source) | 100 / 100 ms |
| Camera follow (source) | exponential 10/s, 69.3 ms half-response |
| Firing (source) | 3 Hz; one-hit tag; no energy |
| Respawn / shield (source) | 2 s / 1 s |

Baseline short and held jumps are identical. Baseline impact applies impulse
(±4.8, 2.5, 0 or 1); recovery acceleration is 3 for 250 ms, then normal.
These are source facts, not measured impulse outcomes. Camera collision is present
in Laser but absent in Dash. No baseline camera settling/impact wall-clock trace
or guest-delay measurement was captured; no invented comparison is made.
Input-only course completed in 58.23 simulated seconds with zero respawns in the
baseline browser suite. Shooter suite records input-driven AI tags and respawns.

Live HTTPS observation: `https://leonardo-maglanoc.com/party-panic/` served
`index-CbcAdoWy.js` / `index-CcVvxptN.css`, matching the local v0.2 build. GitHub
Pages run 39279870192 (source 2f560539cd4f620c23514ddbabc4310c2bad4248) now reports
success, resolving the previous report's pending deployment. The documentation
HEAD is newer than that published source; asset equality establishes runtime only.

Desktop and emulated-phone tests are Chromium/SwiftShader, not hardware phone
measurements. Android Chrome, iPhone Safari, physical devices and independent
human comparisons: NOT TESTED. Existing v02 performance figures are historical,
not newly measured baseline performance or v03 results.

## Upstream source study

* Wobble Rush 3D `b395e4a91ebdfb829533b1ae6beda244371658a3`, MIT,
  copyright 2026 YeonGyu Kim. Read player.ts, constants.ts, contact-response.ts,
  collision.ts, camera-rig.ts, camera-math.ts, jumping/contact tests.
* Blockyard `a8cce1caeda1fbec9c913030f14ed3435c6d8d20`, MIT,
  copyright 2026 Patrick Blais. Read tagger.shared.ts, tagger.server.ts,
  client/tagger.ts, blockfront/weapons.ts, blockfront/hits.ts and the actual
  tests/headless/lasertag.ts rate/energy/serial/authority test.
* PlayCanvas engine `982f5a68b248c66e7cd382e61de83acb22686249`, read the native
  third-person-controller.mjs, including independent touch sources, yaw-only
  movement, frame-independent turning and padded camera raycast.

Adaptation decisions and notices are in assets.md and v03-gameplay.md.
No upstream engine, backend, assets or collision resolver is transplanted.
