# v0.2 gate evidence

## G0

See v02-baseline.md and evidence/v02-baseline. Rollback and baseline checkpoint
076fb87. Clean install/typecheck/lint/16 units/build passed; nine browser tests passed
across isolated runs; real WebRTC explicitly skipped under the local managed UDP policy.

## G1 — display and readiness

- DisplayMode invokes fullscreen synchronously in Solo/Start/Ready handlers, then tries
  orientation and wake lock. Actual fullscreen and actual viewport are reported separately.
- Guest readiness is bound to accepted connection and current lobby round. Host waits
  for all connected players; unsupported display APIs do not prevent readiness.
- Results/lobby retain display mode; Leave releases locks and fullscreen. Unexpected
  Escape never reenters automatically. Persisted pagehide exits without destroying the
  reusable helper; ordinary unload disposes listeners.
- Unit tests cover denials, missing APIs, synchronous activation, visibility/wake lifecycle,
  repeated entry/exit, late grants, queued browser exits and cleanup. Real Simulation tests
  cover readiness ownership, all-ready gate and reset/stale readiness rejection.
- Browser tests stub permission outcomes while retaining genuine user clicks, the engine,
  keyboard movement, authoritative timeout/results, rematch and manual viewport rotation.
  These verify application flow, not Android/iOS API support.
- Independent review found and fixed two P2 lifecycle issues: cache-restored disposed
  helper and entry overlapping a pending fullscreen exit. No P0/P1 readiness authority
  defects found in that pass.

Physical Android Chrome fullscreen/orientation, iPhone Safari manual rotation, app
switching, real touch and wake-lock outcomes: **NOT RUN**. No phone certification.

Remaining baseline limits: no TURN/host migration; two PeerJS connections per guest;
trusted browser host. These have not changed in G1.

G1 checks: 13 new display/readiness unit tests pass; 2 new display browser tests pass.
Existing E2E batch: 8 passed/1 skipped/1 failed for now-outdated fixture readiness;
after fixture update all 3 physics tests pass, including eight capsules/three rematches.
Other existing checks were unchanged. Current real WebRTC test is updated to explicit
Ready gestures but cannot run locally under managed browser UDP policy.

Reference runtime follow-up: Freerun HTTP200/canvas/input probe succeeded; Blaster
HTTP200/canvas/control text observed, screenshot exceeded30s and input probe was not
reached. No reference movement/performance comparison is inferred from software rendering.

## G4 — two-mode lifecycle

Protocol v2 names modeId+roundId on gameplay inputs/snapshots/events and readiness;
unknown versions, stale rounds and cross-mode inputs are rejected before sequence
advancement. Only host lobby UI selects the mode. Room transport is preserved.
Scene disposal removes the old world's batch group, colliders, triggers and effects;
player bodies reset explicitly. Rematch advances the epoch, preventing finish-to-spawn
interpolation and invalidating previous-round inputs/readiness.

Seven new mode/protocol units pass. Actual engine E2E passes initial Dash timeout and
three full Laser/Dash cycles: exact repeated native body counts Laser2/Dash15, no
page errors. Laser here is an explicit disposable floor prototype; shooter rules are
G5. Existing course/physics4 browser checks pass (latest61.93s input-only finish).
Independent review found/fixed the P2 rematch-history reset issue; no P0/P1 defects.

## G2/G3 — movement and presentation

See v02-movement.md and v02-presentation.md for before/after measurements and scope.
Vector acceleration removes direction-dependent tuning. Jump buffering/coyote time,
bounded cosmetic guest jump feedback and history reset preserve host authority.
Actual input-only course tests complete in roughly58–66 simulated seconds; three
host-input bots finished in52.70/58.42/61.98 seconds with no falls in the recorded run.
This is automated evidence, not a first-time human race. Collision course dimensions
remain stable; player bumping remains disabled and was not physically prototyped.

## G5/G6 — Laser Tag, AI and multiplayer

Laser Tag has the original shared-cover arena, authoritative capsule/ray intersections,
3Hz firing, range/occlusion/shield checks, host respawns/scores and 90-second results.
Solo supports0/1/3/7 input-driven AI opponents in either mode. They use the same host
input and scoring rules as humans, without injected positions, tags or checkpoints.
Guest Laser positions interpolate authoritative snapshots; unconstrained prediction
was removed after independent review found it could visually pass through cover.

Real hosted Chrome WebRTC tests passed at source3d7a26a: two to eight clients,
malformed/forged/stale rejection, impairments/duplicates, cover, actual fire/tag,
score agreement, rematches, disconnects and switching modes in the same room.
See v02-network.md for exact run, runtime channel properties and test limitations.

## G7 — final local release checks

Source6ef427c: typecheck/lint/**91 unit tests**/production build passed. Local browser
suite: **18 passed,2 skipped** (the two real WebRTC cases run separately in hosted
Chrome). Production UI-only QA: **6/6 passed**, three viewports per minigame, actual
keyboard or simultaneous touch input, three bots, no debug API or runtime/asset errors.
Evidence includes18 screenshots, six diagnostic exports and two landscape recordings.
See v02-performance.md for actual software-rendered measurements and API outcomes.

Final independent review challenged authority, cleanup, stale input, touch ownership,
network budgets, guest cover prediction and measurements. Identified critical defects
were fixed before release; per-round FPS/RTT sampling was corrected in the final pass.

### Remaining acceptance limits

- **High acceptance gap:** physical Android/iOS matrix, human matches, real-phone
  FPS/thermal behavior and cross-platform fullscreen/orientation remain unverified.
- **Medium:** no TURN means some NAT/network combinations cannot connect; no host
  migration. The browser host is trusted. Phone join reliability is unmeasured.
- **Medium:** Laser guest movement uses100ms interpolation and no rewind; real-phone
  latency and aim usability need human testing. Movement retransmissions are unlimited.
- **Low:** player bumping is disabled; course tuning uses automated inputs rather than
  first-time human playtests. No claims of complete physical-device certification.
