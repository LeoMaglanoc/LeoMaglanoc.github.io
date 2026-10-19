# G3 — course readability and feedback

Keep the validated course geometry, ordered checkpoints, 120s hard timeout and quick
safe respawns. Input-driven races already occupy the target60–90 simulated seconds;
there is no measured need to move checkpoints or add obstacle categories.

- Gap lips and deck undersides reveal actual gap depth. Edge lights now follow real
  decks; baseline lights had visually bridged open gaps.
- Sweeper radial markings/endcaps describe occupied space and motion.
- Bumper rails/end stops telegraph travel, while multiple lanes remain available.
- Render-only foot/arm stride, airborne stretch, landing squash and bounded particles
  provide motion/hit/checkpoint feedback. No visual scale changes a capsule collider.
- Shared procedural sound cues require a player gesture; sound may be muted.
- Static decoration uses the existing batch group. Particles cap24 and expire within
  650ms; audio caps8 voices. Leaving clears transient entities and player animation data.

Player-to-player collision remains disabled. The baseline mask avoids body stacking;
without physical eight-phone/performance evidence, introducing impulses would trade
proven stable traversal for an unmeasured interaction. Obstacle impulses remain
host-authoritative and bounded. This is a retained limitation, not a tested claim
that all controlled-bump approaches are unstable.

Independent review: collision geometry unchanged, bounded visual ownership, no P0/P1
issues. Found missing local landing-audio path; corrected via presentation callback.
Physical touch feel/human first-time duration/phone render performance remain unverified.

Gate checks:38units/typecheck/lint/build pass. Seven browser regressions pass: input-only
course,3physics/lifecycle and3viewport tests. Solo body count remains15; eight-capsule
rematch body allocation stable. Input-only course65.6478s with1fall (hazard timing varies
with live browser scheduling); within target simulated duration. Screenshots inspected
and preserved in evidence/v02-presentation. Final callback addition typechecks/lints.
