# v0.2 production browser evidence

## Scope

On 2026-10-19, `node tools/v02-release-qa.ts` exercised the production Vite build
at `http://127.0.0.1:8080/party-panic/`. All six scenarios passed. Each selected
one of the two modes, enabled three real simulation-controlled AI opponents,
entered solo gameplay through the normal UI, waited for the actual countdown,
and supplied eight seconds of browser keyboard/mouse or simultaneous touch
input. No debug API, teleport or score manipulation was used.

This run used automated Linux Chromium and **SwiftShader software rendering**.
Phone dimensions were emulated viewports, not physical phones. The exported
measurement interval includes countdown, active gameplay and screenshot/export
overhead. These are not steady-state hardware performance results.

| Mode          | Viewport   | FPS samples | Median FPS | 5th-percentile FPS |
| ------------- | ---------- | ----------: | ---------: | -----------------: |
| Obstacle Dash | 1440 × 900 |         114 |      10.04 |               4.51 |
| Obstacle Dash | 844 × 390  |         246 |      18.87 |              11.25 |
| Obstacle Dash | 390 × 844  |         258 |      21.55 |              11.48 |
| Laser Tag     | 1440 × 900 |         136 |      10.28 |               5.36 |
| Laser Tag     | 844 × 390  |         286 |      23.09 |              12.12 |
| Laser Tag     | 390 × 844  |         295 |      30.21 |               9.79 |

The representative-phone targets of median ≥45 FPS and fifth-percentile ≥30 FPS
remain **unverified**. This software-rendered environment cannot establish those
targets. The differing viewport results must not be presented as device rankings.

## Functional observations

All scenarios loaded the same production JavaScript `index-CbcAdoWy.js` and CSS
`index-CcVvxptN.css`; SHA-256 hashes and response byte sizes are retained in the
machine report. No JavaScript runtime errors, console errors, failed requests or
HTTP error responses occurred. `window.partyDebug` was absent. The canvas matched
the visible viewport, gameplay did not scroll, and each mode displayed its own
HUD. Screenshots were captured on the home screen, at gameplay entry and after
the input interval.

Fullscreen was observed active in all six automated-browser scenarios. Landscape
orientation locking was rejected with “screen.orientation.lock() is not available
on this device.” Portrait viewports remained portrait and used the rotation
fallback. These are actual automated Chromium outcomes; Android Chrome fullscreen
and iPhone Safari behavior remain unverified on physical devices.

Laser Tag desktop diagnostics recorded 10 shot, 8 tag and 6 respawn events. This
confirms active host simulation in the captured interval; it is not a complete
human match or proof of multiplayer networking quality. Solo runs have no peer
RTT or WebRTC bandwidth sample, so they cannot substantiate those targets.

## Artifacts and reproduction

- `docs/evidence/v02-release/local-report.json`: all checks, API observations,
  viewport dimensions, asset hashes, diagnostics and recording paths.
- `docs/evidence/v02-release/*-diagnostics.json`: unmodified in-game downloads,
  including measurement scope, phases, sample counts and event logs.
- `docs/evidence/v02-release/*-{home,game,hud}.png`: six scenarios, three captures
  each.
- `docs/evidence/v02-release/videos/*.webm`: one landscape recording per mode.
  These are automated Chromium captures including loading/countdown and eight
  seconds of real-input gameplay, not human phone recordings.

Run from the project directory with the production preview already serving:

```sh
node tools/v02-release-qa.ts
```

`PARTY_URL` selects another production HTTPS deployment; `PARTY_QA_LABEL` separates
its artifacts. Optional recording requires Playwright's FFmpeg installation.
Real Android/iOS runs, a complete human match, phone frame-time distributions,
join reliability, peer RTT/bandwidth and eight-device memory trends still require
separate validation.
