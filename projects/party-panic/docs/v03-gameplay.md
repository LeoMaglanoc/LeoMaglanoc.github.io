# Party Panic v0.3 gameplay decisions

## Obstacle Dash

Wobble Rush player.ts/constants.ts inspired separate held-rise, released-rise and
fall gravity, a committed dive, momentum decay and ramped stumble authority.
Party Panic's single Ammo capsule still owns collision/integration, ground probes,
ordered checkpoints and respawns. The controller adjusts only the difference
between chosen gravity and Ammo's -18 gravity; it never integrates position itself.

Speed remains 2.8, acceleration 36, braking 42, jump speed 7.5. Rise gravity 18,
fall 22, release cut 44. Dive has 6.2 maximum speed, 1.6 lift, 320ms commitment,
850ms cooldown, 20% air steering; input sequences are monotonic and consumed even
when an edge is rejected. Air braking is 2, air acceleration 9. Impacts retain 45%
of horizontal velocity, impart the existing 4.8 sideways throw and at least 2.5 lift;
steering returns from 80ms through 450ms. Repeated contacts retain the existing
600ms immunity. Respawn, round change and pause clear transient actions.

Space and Jump support duration. Shift and a separate reachable Dive button use
press edges. Touch pointers retain ownership until up/cancel/lost capture.
Right-side drag or canvas drag orbits the camera; movement uses the same yaw basis.
Yaw follows the shortest arc at 14 rad/s. Camera position/target half-lives are
90/70ms and its final smoothed position is ray-clipped against static/kinematic
Ammo geometry with 0.25 padding. Manual orbit is never auto-rotated under held input.

Initial fall gravity 24 caused slower bots to miss gaps. It was reduced to 22 and
bots take off closer to the edge (0.20 instead of 0.38). All three then completed
with ordinary inputs. No level geometry was redesigned. A rest-start dive was
initially too weak; its minimum launch speed now includes running speed.

Tests and final before/after numbers are in v03-validation.md and raw evidence.
Human preference is not established by these tests. Real phones and three blind
human comparisons remain NOT TESTED.

## Laser Tag

Original two-profile weapon rules in weapons.ts adapt Blockyard's small shared
energy/rate/serial system. Quick: 4 shots/s, 34 damage, 0.22 energy; Charged:
0.95s cooldown, 70 damage, 0.52 energy and 280ms host-observed preparation.
Both recharge 0.36/s and share cooldown/energy across switching. Full health is
100, so unprotected body encounters take three Quick or two Charged hits.
Spread is small, bounded and deterministic by shot serial; no random client hit claim.

Local muzzle/tracer/audio runs immediately when a local shot is possible. A short
field-of-view kick decays at 18/s; it leaves the center aiming ray unchanged.
Host damage events confirm hits; elimination gets a distinct marker/audio. HUD
shows health, shield/respawn and energy; 1/2 keys and two mobile buttons select weapons.
Charged preparation appears in the weapon status. Bots use both profiles and the
same host charge/energy gates. Damage, cover, range, shield, life and score remain host-owned.

Protocol v3 carries held jump, dive serial, weapon, per-life input generation,
movement acknowledgements and consumed shot acknowledgements. Old clients must
reload. Invalid/duplicate/stale serials are consumed before they can become later
shots. Per-life binding rejects unseen delayed pre-death input after a respawn.
Energy reconciles on each new snapshot, subtracting only unacknowledged local shots;
new lives clear speculative shot costs. Guest receive allowance is 256 reliable
messages/s for eight 4Hz shooters plus damage/elimination and injected duplicates;
host incoming control allowance remains 30/s, with existing input/packet bounds.

## Collision-aware local Laser movement

laserPrediction.ts is a bounded visual prediction/replay prototype against the
same LASER_COVERS AABBs used by Ammo, camera and shots. A conservative radius
plus skin, swept segments, small steps, axis sliding and clipped corrections keep
positions out of cover; rounded corners may feel more conservative than Ammo.
Snapshots acknowledge consumed input sequences; pending visual commands replay
for at most 150ms. Larger errors snap to authority, respawn/round/pause reset,
and snapshots older than 600ms disable prediction. No client position affects
host movement, hits or scores. Other players retain snapshot interpolation.
This is a fixed-arena predictor, not a replacement Ammo simulation or lag rewind.
Remote acceptance and correction measurements must be read with the final test
results; geometry unit tests alone do not establish network gameplay quality.

## Final deterministic comparison

Same actual Ammo fixed-step scenarios (`v03-baseline/movement.json` versus
`v03-gameplay/final.json`), not wall-clock phone measurements:

| Quantity                               |                 v0.2 |             v0.3 |
| -------------------------------------- | -------------------: | ---------------: |
| Ground speed                           |               2.8000 |           2.8000 |
| Cardinal / diagonal to speed           |        83.3 / 83.3ms |    83.3 / 83.3ms |
| Stopping distance                      |              0.11667 |          0.11667 |
| Full-jump rise                         |                1.500 |            1.500 |
| Short-hop rise (release after 3 ticks) |    same as full jump |            0.785 |
| Full-jump flight                       |              833.3ms |          800.0ms |
| Rest-start jump range                  |               1.9992 |           1.9058 |
| Short-hop flight / range               |  no duration control | 483.3ms / 1.0192 |
| Run / dive displacement at 0.5s        | run 1.2667 / no dive |  1.2667 / 2.4367 |
| Accepted dives from one held serial    |          unavailable |                1 |

Faster falling intentionally reduces full-jump range about 4.7%. Slower bots need
the later takeoff and still occasionally respawn: final observed bot finishes
62.12 / 67.48 / 65.68 simulated seconds, with 0 / 2 / 1 respawns. This is a known
course-timing tradeoff, not proof that first-time human jumping is better.
The single input-only traversal varies with wall-clock startup/obstacle phase:
final observed finish 73.03s with one respawn, versus baseline 58.23s with zero.
Neither value is a blind human result or evidence of improved completion time.
