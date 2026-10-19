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
