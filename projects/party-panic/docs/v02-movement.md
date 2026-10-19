# Obstacle Dash movement comparison

## Method

`node tools/v02-movement.mjs before` runs the actual PlayCanvas/Ammo host simulation
in Chromium, with fixed 1/60 s steps and input commands only. Its default Vite URL
is port 5174; set `PARTY_URL` to override. Each scenario starts a fresh solo round.
Raw per-tick positions and velocities are retained in
`docs/evidence/v02-movement/before.json`. These are deterministic simulation
measurements, not wall-clock input latency or physical-phone performance claims.

## Baseline

| Measurement             | Cardinal | Diagonal |
| ----------------------- | -------: | -------: |
| Maximum running speed   |   2.8000 |   2.8000 |
| Acceleration from rest  |   100 ms |  66.7 ms |
| Braking from full speed |   100 ms |  66.7 ms |
| Stopping distance       |   0.1550 |   0.1160 |

The existing per-axis approach applies more total acceleration diagonally.
Movement speed is already normalized and is not being increased. Measured jump
apex is 1.500 units above the ground, flight to the landing threshold is 833.3 ms,
and the rest-start forward jump travels 1.9733 units. First visible lift in the
sampled physics positions occurs at 33.3 ms; this is not a browser input-latency
measurement. A held jump sequence fires once; an expired midair press does not
double jump; a press shortly before landing buffers a second valid jump.

## Reference comparison and decision

The official PlayCanvas controller uses velocity damping, capsule grounding,
edge-gated jumping and a smoothed camera. Its force model and input ownership are
different from this project's authoritative fixed-step simulation. Freerun 08
specifies velocity approach, separate ground/air acceleration, 100 ms coyote
time and 120 ms buffering. Its additional movement abilities are outside this
release. No controller source or artwork is copied.

Party Panic already has five ground probes, 100 ms coyote time, 100 ms buffering,
monotonic jump sequences and capsule physics. Preserve those systems and the
7.5 jump velocity / 18 gravity / 2.8 maximum speed. The bounded change implemented
after the display-mode gate uses vector-limited velocity approach, ground
acceleration 36 and braking 42, preserving air control 9 and brief hit impulses.
This targets consistent diagonal behavior and shorter stopping distance while
preserving existing obstacle reach and course pacing.

## Measured result

`node tools/v02-movement.mjs after` records the same setup after tuning.

| Measurement             | Before cardinal / diagonal | After cardinal / diagonal |
| ----------------------- | -------------------------: | ------------------------: |
| Acceleration from rest  |              100 / 66.7 ms |            83.3 / 83.3 ms |
| Braking from full speed |              100 / 66.7 ms |            66.7 / 66.7 ms |
| Stopping distance       |            0.1550 / 0.1160 |           0.1167 / 0.1167 |

Maximum speed remains 2.8. Jump apex, first lift and flight duration remain
1.500 units / 33.3 ms / 833.3 ms. Rest-start jump distance changes from 1.9733
to 1.9992 units because initial ground acceleration changes. Both buffered
landing and expired-midair-input checks retain their expected jump counts.
The measured stopping distance includes the real engine's one-step position
integration delay; it is not calculated from velocity alone. Equal diagonal
and cardinal response is the demonstrated improvement; diagonal acceleration
is intentionally slower than the old unintended per-axis boost.

Verification: four movement unit tests and three isolated real-Ammo browser tests
pass. Browser tests enforce cardinal/diagonal acceleration and braking bounds,
actual landing buffering, and no repeated jump from a held sequence. The
existing input-only course traversal reaches the authoritative finish in
61.93 s with zero respawns. Scoped lint, typecheck and formatting checks pass.

## Evidence limitations

No physical Android/iOS feel comparison has been performed here. Camera and
guest reconciliation improvements are tracked in the integration work. No claim
of player-collision or phone-performance improvement follows from these tests.

## Guest feedback and camera integration

Guest jump input gets an immediate cosmetic ballistic response, bounded to250ms pending
confirmation; it never changes physics or authoritative race progress. A confirmed
ascending jump cannot be pulled downward by delayed snapshot reconciliation; falling
and landing converge to authority. Countdown/paused/finished inputs seed the sequence
without arming feedback. Respawns snap history and new rounds discard it.
Camera follow rate changes7→10/s (calculated half-response99→69ms) and forward lookahead
3→4.5 units. No physical-phone latency or human camera-preference claim is made.

G2 second-pass review found and fixed cosmetic countdown ghost-jump and confirmation
handoff dips. Unit tests cover both cases. Checks: new movement4 + prediction5 unit
tests pass; new Ammo movement3 browser checks pass; isolated course+physics regression
4/4 pass (latest input-only course65.63s, zero falls). Earlier overlapping test runners
shared artifacts and one runner stopped the other's reused server; those harness
failures were rerun with a persistent server and isolated output. No product defect
was inferred from the interrupted runs.
