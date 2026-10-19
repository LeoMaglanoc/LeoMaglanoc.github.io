# G5 Laser Tag and solo AI

One original symmetrical28×22 arena: eight sheltered spawns, cover/routes, floor grid,
perimeter walls. Identical AABBs drive rendering, Ammo colliders, camera collision,
cover navigation and host shot intersections. Procedural geometry/audio only.

Host owns90s clock, capsule motion, three-shots/sec cooldown,25-unit range, one-hit tags,
2s respawn,1s protection and scores. Firing sequence is consumed even when cooldown
rejects it. No guest hit/score claims. Camera ray chooses aimpoint; the muzzle ray must
reach it through actual cover. Protected live players absorb rays and grant no score.
Safe respawn chooses a distant/occluded spawn deterministically. Equal scores display
a tie, with ID used only for stable row order. No aim assistance, headshots, ammo or reload.

Yaw/pitch are bounded radians. Shared camera rig clips against walls and floor; its
geometry is also used by host validation. Desktop mouse/pointer lock and left-click;
mobile left joystick plus right drag aiming, with hold-and-drag FIRE for two thumbs.
Quick taps retain their firing sequence briefly for packet delivery. Blur, cancel,
context changes and Escape clear held inputs/pointer lock. Rejected display/input APIs
have fallbacks. Local tracers/sounds are cosmetic; hit confirmation and score require host.

Laser guests intentionally use100ms authoritative movement interpolation. The race's
unconstrained local translation approximation would drift into cover; independent review
identified this P1 defect and it was removed for Laser. No guest Laser movement prediction
or lag rewind is claimed. Immediate local aim/fire remains. G6 must test blocked guest motion.

## User-requested solo bots

The user explicitly overrides the brief's no-AI restriction. Choose0/1/3/7 AI opponents
(default3);0 keeps solo practice. Bots are clearly markedAI, hosted locally and never
represented as network peers. They generate normal bounded inputs and use the same
host collision, cooldown, shot, checkpoint and result rules. No score/position mutation.
Race bots vary lanes and pace. Laser bots navigate a small arena grid, turn at bounded
speed, react after300ms and only request shots with an unobstructed aim solution.
These are rule-based bots, not trained models. Multiplayer rooms contain humans only.

## Actual gate evidence

84 unit tests pass, including13 laser geometry/rule,8 LaserRound authority,12 input,
6 bot and prior lifecycle/race checks. Typecheck/lint/build pass. Full browser suite:
**18 passed,1 explicit WebRTC skip** under local managed UDP policy.

- Complete90s solo Laser match with3 bots, real input-driven tags/respawns; tag/death
  totals match, scores reset on rematch, switching back to Dash works.
- Genuine Chromium two-touch injection moves joystick while dragging/holding FIRE;
  host shot events occur and releasing touch clears fire. Synthetic dispatch alone
  cannot establish native pointer capture; the test uses browser touch injection.
- All3 race bots finish actual gaps/sweepers/bumpers through input, in52.70/58.42/61.98
  simulated seconds, no test placement/progress claims. No human timing claim.
- Mode cycles repeatedly return to17 Laser /15 Dash native bodies with one player.
- Camera upward-angle floor clipping regression and protected-target farming tests pass.

Screenshots/input-state reports in evidence/v02-laser. Physical Android/iOS aiming,
fullscreen, input latency and performance: **NOT RUN**. Human mobile playtests remain
required before calling the release phone-validated.
