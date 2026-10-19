# v0.2 baseline — 2026-10-19

Rollback: `27c7f52c84f33e4ee69680524408f3887f266b63` (v0.1 documentation HEAD;
production runtime `99d98c7bf19e50fa57817178ed54d93797c0099e`). New branch:
`party-panic-v02`. No AGENTS.md exists in the repository tree. Only projects/party-panic
will change. Node v24.19.0. npm ci installed 182 pinned packages successfully.

## Existing checks

- Typecheck, lint, all 16 Vitest tests, production build pass on unchanged runtime.
- Production asset index-C6rFjFDh.js, 1,276.69 kB / 339.84 kB gzip.
- Browser course, three physics/lifecycle tests and three viewport tests pass.
- Real WebRTC test explicitly skipped locally: existing managed-browser UDP restriction.
- Initial browser batch's last two tests overlapped an early readiness edit; that edit
  was restored and those two tests rerun on unchanged runtime. See outcome below.
- Physical phones: unavailable; all Android/iOS acceptance remains NOT RUN.

## Movement: measured and calculated

`tools/v02-baseline.mjs` captures six original screenshots and raw measurements in
`docs/evidence/v02-baseline/`. Measurements step actual Ammo via existing debug API;
no test teleport or fake finish is used. Desktop and both phone viewports agree:

| Quantity                             | Baseline / method                                                                                                                        |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Max run speed                        | 2.800003 units/s measured                                                                                                                |
| Acceleration                         | 30 units/s² ground, 9 air from source                                                                                                    |
| Rest to run speed                    | 0.0933s continuous / 6 fixed steps (calculated ground)                                                                                   |
| Braking distance                     | ≈0.131 units continuous ground calculation                                                                                               |
| Jump input to visible simulated lift | 0.0333s in fixed-step harness                                                                                                            |
| Host input sampling                  | 30Hz; adds 0–33.3ms before simulation, excluding network                                                                                 |
| Jump apex                            | y=2.24997 from y=0.74997, rise≈1.5 units measured                                                                                        |
| Time to apex / flight                | 0.4167s / 0.8333s measured                                                                                                               |
| Full-speed horizontal jump           | ≈2.333 units calculated speed × flight                                                                                                   |
| Jump buffer / coyote                 | Both 100ms, existing source; jump sequence deduplicates                                                                                  |
| Camera                               | exponential rate 7/s, ≈99ms half-response / 429ms 95% calculated                                                                         |
| Player collision                     | group128 mask22 excludes other players; obstacle collision enabled                                                                       |
| Guest rendering                      | 100ms remote interpolation; max150ms extrapolation; horizontal approximation and rate12 reconciliation; no initial local jump prediction |

Input-only course: finish **61.9379 simulated seconds**, checkpoint2, zero falls.
This already meets nominal short-session course duration in automation; no evidence
supports calling the existing course broken. Human first-time timing remains unknown.

Frame samples in the raw report include startup, screenshots, debug stepping and
competing SwiftShader browser tests. They are **not** steady-state performance or phone
measurements. Desktop median5.38/p5 1.51 FPS; landscape15.72/2.68; portrait23.87/4.29.
These instrumented software-renderer figures cannot establish a device regression.
A dedicated steady-state run must exclude stepping and compare identical renderer/load.

## Reuse / known networking limits

Keep transport, connection-bound InputGate, snapshot sequencing, host visibility pause,
Ammo capsules and probes, ordered triggers, QR, colors, invitation and rematch flows.
Two PeerJS associations per guest =14 host connections at capacity. Existing recorded
real Chrome CI observes unordered channels with unlimited retransmission; reliable:false
is not proof of limited retransmission. Keep runtime inspect diagnostics.
No TURN, host migration or lag compensation. Real phones/NAT remain unverified.
Prior release evidence in docs/validation.md applies only to its recorded commit.

## References inspected

Fetched original official PlayCanvas controller (29,176 bytes) and MIT LICENSE;
Freerun08 prompt.md (32,994 bytes), Blaster Range prompt.md (49,494 bytes), both live
HTML entry points, official raycasting docs and MDN requestFullscreen/orientation.lock.
Reference content is retained outside repository in /workspace/scratch/references.
The prompt repositories contain specifications rather than finished reusable source.
Freerun's ground acceleration60, air15, buffer120ms/coyote100ms and dt-correct camera
principles inform controlled comparisons; its extra movement abilities are out of scope.
Blaster's camera/aim and cover principles inform an original compact arena.
See assets.md; no reference artwork or code was transplanted.

Smoke recheck: **2 passed** on restored unchanged runtime. Baseline totals across
isolated runs: 9 passed, 1 explicitly skipped.
