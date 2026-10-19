# Party Panic v0.3 engineering delivery

Runtime implementation: `778bdb73ee81447251feb85cd8698c102454fd94` on `main`.
Gameplay/protocol source checkpoint: `7f0feb8174f587c61aabf366ff6f90d1543636c7`.
Baseline / rollback: `43cb574b1fb3e6d55fe0187f90d03027cbaafdc5`.
Later evidence commits do not change gameplay. Exact changed paths are listed in
[evidence/v03-validation/changed-files.txt](evidence/v03-validation/changed-files.txt).

## Delivered changes and decisions

- G0 `ed19ee7`: reproducible baseline, actual upstream implementation study, source
  hashes and full MIT notices. Existing v0.2 deployment was checked, not assumed.
- G1 `ca8656c`: early menu/Host/Join entry; display persists across leave, results,
  rematch and switching. Browser exit invalidates pending resources without reentry.
- G2 `9c61d47`: held/cut/fall gravity, committed edge-gated dive, bounded stumble
  recovery, vector movement, touch ownership, smooth turning and padded orbit camera.
- G3/G4 `7f0feb8`: two energy weapons, multi-hit health, host charge/damage/scoring,
  local effects, acknowledged energy, per-life input rejection and bounded visual
  guest replay. These units share the protocol and control interfaces and were
  integrated sequentially in one complete source checkpoint.
- G4 visual QA `778bdb7`: moved diagnostics away from Dive/weapon buttons and kept
  the landscape home footer out of Join. Nine-point browser hit tests cover controls.
- G5: independent review, Chrome regression/network runs, paired recordings and
  raw measurement reports. No engine, backend, minigame or generic framework added.

Core files: movement.ts, simulation.ts, input.ts, protocol.ts, scene.ts,
laser.ts, laserRound.ts, new weapons.ts/laserPrediction.ts, main.ts, bots.ts,
audio.ts, rules.ts, platform/displayMode.ts and style.css. Package version is 0.3.0;
PlayCanvas/Ammo/PeerJS/Vite versions and Pages base path are preserved.

## Upstream provenance

See [assets.md](assets.md) for copied/adapted/independent behavior and shipped notices.

| Source                       | Exact inspected commit                     | Adaptation                                                                                    |
| ---------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------- |
| Wobble Rush 3D               | `b395e4a91ebdfb829533b1ae6beda244371658a3` | Variable gravity, committed dive, momentum decay, stumble ramp, half-life follow              |
| Blockyard                    | `a8cce1caeda1fbec9c913030f14ed3435c6d8d20` | Energy/rate/serial rules, local effects versus host hit and elimination confirmation          |
| PlayCanvas native controller | `982f5a68b248c66e7cd382e61de83acb22686249` | Studied touch ownership, yaw movement and padded camera collision; independent implementation |

Both primary sources are MIT; complete notices ship in public/licenses. The pinned
native controller's SHA-256 matched the initially inspected main source. No assets,
Three.js collision resolver, voxel engine, Rust backend or proprietary art copied.

## Automated checks and actual browser evidence

| Run                                 | Result                                                                                            | Raw evidence                                                            |
| ----------------------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Baseline npm ci / npm run check     | PASS; 91 unit tests                                                                               | v03-baseline/install.txt, check.txt                                     |
| Baseline npm run test:e2e           | 18 passed, 2 opt-in network skips                                                                 | v03-baseline/browser.txt                                                |
| v0.3 npm run check                  | PASS; typecheck, lint, 104 units, build                                                           | v03-validation/check.txt, check-layout.txt                              |
| v0.3 npm run test:e2e               | 23 passed, 2 explicit WebRTC skips                                                                | v03-validation/browser.txt                                              |
| Final CSS/display/control hit tests | 9 passed                                                                                          | v03-validation/layout-browser.txt                                       |
| Local RUN_WEBRTC=1 attempt          | **2 FAILED** at guest admission, not counted as skips/passes                                      | v03-validation/local-webrtc-failed.txt, local-webrtc-results.json       |
| Hosted real Chrome WebRTC           | **2 passed**, 0 skipped, 195s                                                                     | run 39315066614, hosted-chrome-results.json / hosted-chrome-network.txt |
| Independent final code review       | 104 full tests independently pass in fresh context; prior 68 focused pass; no P0/P1 code findings | independent-review.txt                                                  |

Real networking run:
https://github.com/LeoMaglanoc/LeoMaglanoc.github.io/actions/runs/39315066614
(source 7f0feb8, Google Chrome 155.0.8059.39). The final CSS-only checkpoint also passed its hosted repeat: run 39315842519,
2 passed / 0 skipped in 159.8s at source 778bdb7.
The local failure is consistent with this managed environment's prior ICE/admission
limitation; it is not substituted for real remote evidence. The requested dedicated
Chrome computer-agent tool was unavailable; actual Chromium/Chrome was driven through
Playwright/CDP, and final screenshots were inspected visually.

Hosted cases cover genuine PeerJS, two-to-eight clients, gesture fullscreen/readiness,
cover blocking, three-hit elimination, authoritative matching scores/deaths, forged
hits/scores, delayed/reordered/duplicate traffic, rematch, disconnects and same-room
mode switching. Match timeout is accelerated in the existing test harness; this is
not an uninterrupted 90-second human match or varied-NAT test. Some existing isolated
race trigger tests use debug placement; full course, AI and production recordings
use ordinary input without setting successful positions or progress.

Eight-client Laser firing lasted 17.908 real seconds, with all eight shooters observed,
14 host / 2 guest associations, 24 host / 16 guest native bodies and zero queued
outgoing bytes at the sample. Sheltered spawns produced zero eliminations during
that stress interval; separate two-client combat verified damage and elimination.
Movement channels were unordered with **unlimited retransmissions**, not an assumed
unreliable transport. Recorded two-client RTT samples were 9.3 / 3.8ms; these are
single hosted desktop samples, not phone/network latency targets.

Guest input-to-first-observed JavaScript render-position movement was 10.2ms in one
real Chrome sample with injected 120ms transport delay in each direction. Visible z
advanced from -8 to -7.92775 while the latest authority still reported -8. This is
not photon latency, not a baseline comparison and not a phone result. Cover stopped
authority at z=-6.429997 and the conservative visual capsule at -6.446. One guest's
cumulative sample showed 5 corrections over 105 accepted snapshot ticks, maximum
0.2662 units; others recorded zero in their sampled intervals. Counters span their
own session windows and do not establish a common correction frequency or packet rate.
See the extracted guest response and authority/stress JSON attachments.

## Gameplay measurements and recordings

[Gameplay report](v03-gameplay.md) contains the full source decisions and comparison.
Raw real-Ammo traces: v03-baseline/movement.json and v03-gameplay/final.json.

| Deterministic scenario              |               Before |                     After |
| ----------------------------------- | -------------------: | ------------------------: |
| Run speed / time to speed           |         2.8 / 83.3ms |              2.8 / 83.3ms |
| Braking distance / stop time        |     0.11667 / 66.7ms |          0.11667 / 66.7ms |
| Held jump rise                      |                1.500 |                     1.500 |
| Short hop rise                      |         same as held |                     0.785 |
| Held jump flight / rest-start range |     833.3ms / 1.9992 |          800.0ms / 1.9058 |
| Run / dive distance at 0.5s         | 1.2667 / unavailable |           1.2667 / 2.4367 |
| Quick / Charged hit requirements    |  one hit universally | 3 / 2 hits at full health |

Cardinal and diagonal response stays equal. Buffered landing and expired-midair
edges behave correctly; one dive serial produces exactly one burst. Course bots
finish with 0/2/1 respawns, versus zero in baseline: faster falling requires later
takeoff and remains a human-tuning follow-up. No human preference improvement is
inferred from numeric correctness, attractive screenshots or AI victories.

The paired production browser reports and videos are in evidence/v03-browser/.
They use identical input schedules and 844×390 landscape capture for each mode;
the intentionally changed Dash camera and different real frame timings prevent
pixel-aligned trajectory comparison. Each recording includes loading, countdown
and eight seconds of genuine keyboard or simultaneous browser touch input with
three AI opponents. No production debug API, teleport or fabricated finish is used.

## Performance scope

See evidence/v03-browser/comparison.json for frame-time distributions, cold/warm
readiness, JavaScript heap samples and recording paths. Before/after scenarios run
sequentially in Chromium with SwiftShader on this machine, through production
localhost previews. RAF samples cover the active interval including screenshot
work; exported FPS also includes countdown. Cold means new browser context; warm
means reload. JavaScript heap excludes native Ammo/GPU memory. This is not physical
mobile performance, thermal behavior or a statistically controlled regression study.
Native entity cleanup is independently checked across three repeated mode cycles
(17 Laser / 15 Dash native bodies with one player). No body-count regression observed.

A warm-cache evidence run initially flagged 2/6 scenarios because its asset hasher
tried to read HTTP 304 bodies. All gameplay/UI/runtime checks passed in those cases.
The hasher now hashes HTTP 200 bodies and preserves real request failures; raw failed
report is cache-hash-harness-failure.json and the final run is retained separately.
An earlier integration run also found a countdown/control activation race; retaining
countdown movement while gating firing fixed it. Shared-server harness failures and
initial over-short bot jumps are retained, with their passing reruns; no failure is
silently labeled a pass.

## Acceptance gates and remaining limits

| Gate                                                                       | Status                                                                         |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| G0 baseline and upstream/license study                                     | PASS for available deterministic/browser checks                                |
| G1 session-independent display                                             | PASS automated lifecycle and desktop Chrome; phone support NOT TESTED          |
| G2 race correctness                                                        | PASS automated mechanics/course; human controllability/preference NOT VERIFIED |
| G3 shooter authority and complete bot/remote lifecycle                     | PASS automated real simulation and real Chrome peers                           |
| G4 integration, mode/rematch/input/cleanup                                 | PASS automated checks                                                          |
| G5 physical devices, representative-phone performance and human comparison | **OPEN — NOT TESTED**                                                          |

No known P0/P1 runtime defects after independent review and fixes. Remaining items:

- **P2 acceptance gap:** Android Chrome and iPhone Safari fullscreen, wake/orientation,
  real two-thumb use, frame times, thermal/memory behavior and varied network paths
  are NOT TESTED. No physical devices were available.
- **P2 acceptance gap:** three independent human comparisons, aim/missed-jump/error
  outcomes and preference ratings are NOT TESTED; no testers were available here.
- **P2 tuning follow-up:** slightly shorter full jumps and conservative prediction at
  rounded corners need human playtesting; no course redesign was silently introduced.
- **P2 existing network limit:** no TURN or host migration; some NATs cannot connect.
  No lag rewind and no claim of cross-platform eight-phone acceptance.
- **P3 packaging:** the large-engine bundle warning remains. The new JS is about
  1,325.5kB / 356.4kB gzip versus 1,312.7kB / 352.3kB baseline (about 1.2% gzip growth).

This is a technically tested browser release candidate, **not a fully accepted
human/phone-certified v0.3 release**. Compilation and bot finishes do not close
those gates.

## Publication and rollback

Implementation commits are pushed directly to main, per the user's instruction;
no feature branch or PR was created. Existing repository workflows run automatically
on push; no separate manual deployment or merge was requested. Deployment status is
checked against exact assets/commit rather than inferred from a successful build.
Final publication observations are recorded below.

To restore v0.2 from a clean repository checkout without rewriting history:

```sh
git restore --source=43cb574b1fb3e6d55fe0187f90d03027cbaafdc5 --staged --worktree projects/party-panic
# Review the scoped rollback, then commit, run npm ci / npm run check, and push main.
```

Reproduction: npm ci; npm run check; npm run test:e2e; RUN_WEBRTC=1 npm run test:e2e
-- tests/e2e/network.spec.ts. Start baseline/final production previews, then use
PARTY_URL=… PARTY_QA_LABEL=before/after node tools/v03-browser-qa.ts and
node tools/v03-evidence-summary.mjs. Fixed-step traces use
PARTY_URL=http://127.0.0.1:5174/party-panic/ node tools/v03-movement.mjs final.

### Final measured software-renderer performance

Active RAF frame times, median / p95 milliseconds (one sequential sample each):

| Mode and viewport |        Before |         After |
| ----------------- | ------------: | ------------: |
| Dash 1440×900     |  83.3 / 150.1 |  83.4 / 166.6 |
| Dash 844×390      |   50.0 / 83.4 |   50.0 / 83.4 |
| Dash 390×844      |  50.0 / 100.0 |   33.4 / 83.4 |
| Laser 1440×900    | 100.0 / 183.3 | 100.0 / 183.4 |
| Laser 844×390     |   33.4 / 83.4 |  50.0 / 100.0 |
| Laser 390×844     |   33.3 / 66.7 |   33.3 / 83.2 |

**P2 performance follow-up:** Laser landscape was slower in this software-rendered
sample (median about 30→20 FPS). This is a measured possible regression, not a phone
result and not dismissed as a pass. Repeated hardware runs and profiling are needed
before performance acceptance; this single scenario does not identify its cause.
The screenshot/input/AI workload has more persistent multi-hit encounters than v0.2.
No representative-phone 45 FPS target is established by either version here.

Landscape cold/warm engine readiness: Dash 1283/600→1354/601ms; Laser
1347/616→1296/586ms, localhost. Landscape JavaScript heap endpoint samples:
Dash 16.48→16.16MB; Laser 26.73→30.56MB. These are GC-sensitive endpoints,
exclude native/GPU memory and are not a leak or physical-device memory study.
Raw per-frame data, p99/min/max, all viewport loading and heap samples remain in
comparison.json and the original before/after reports.

Final production UI evidence: all six baseline and all six final scenarios passed;
no runtime, console, request or HTTP failures in the final run. Fullscreen was
observed, orientation lock was rejected and portrait used the rotation fallback.
Raw browser reports, screenshots, diagnostic exports and landscape videos are
preserved under evidence/v03-browser. Source 778bdb7 assets:
`index-D61cb1lQ.js` / `index-B_WexXAw.css`.

### Final hosted repeat and live publication

- Final source `778bdb73ee81447251feb85cd8698c102454fd94`:
  [Chrome WebRTC run 39315842519](https://github.com/LeoMaglanoc/LeoMaglanoc.github.io/actions/runs/39315842519),
  **2 passed, 0 skipped, 0 flaky**, 159.8s. Exact results, job logs and extracted
  attachments: hosted-chrome-final-results.json / hosted-chrome-final.txt / final-*.json.
- [Pages run 39315842812](https://github.com/LeoMaglanoc/LeoMaglanoc.github.io/actions/runs/39315842812)
  **build and deployment succeeded**. Its project checks again passed typecheck,
  lint, **104 units**, build and **24 browser cases with 2 explicit network skips**
  (26 cases total). The separate real-network workflow above covers those two.
  Raw project CI output: pages-party-panic-check.txt; run metadata: pages-run.json.
- Final repeat guest response observation was 14.3ms; eight-client firing lasted
  16.146 real seconds. Its first guest had 3 cumulative corrections over 91 snapshot
  ticks, maximum 0.2933 units. Cover boundaries match the first run. These are
  repeat observations with the same limitations, not phone/performance acceptance.
- Recorded host and guest final two-client results agree exactly on health,
  energy, score, deaths and respawn state. Posthoc comparison and live asset hashes
  are saved in final-acceptance-observations.json.
- Public HTTPS `https://leonardo-maglanoc.com/party-panic/` served the expected
  `index-D61cb1lQ.js` / `index-B_WexXAw.css`; byte hashes match the tested preview.
  **Both live landscape scenarios passed** with genuine keyboard/touch input,
  three AI opponents, no debug API and no runtime/console/network errors. This is
  emulated Linux Chrome, not an Android phone. See live-report.json and live videos.
- Final footage: videos/obstacle-dash-side-by-side.webm and
  videos/laser-tag-side-by-side.webm under evidence/v03-browser, plus separately
  labeled before/after/live landscape captures. Side-by-side clips pair the complete
  capture timelines; loading durations differ, so they are not frame-synchronized
  physics experiments. The fixed-step JSON traces provide numerical comparisons.

Subsequent documentation/evidence commits use [skip ci] because runtime artifacts are
unchanged. Their source HEAD can differ from the deployed runtime SHA above without
implying a different live game. No public deployment success was inferred solely
from compilation or pushing a commit.
