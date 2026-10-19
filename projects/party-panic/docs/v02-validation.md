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
