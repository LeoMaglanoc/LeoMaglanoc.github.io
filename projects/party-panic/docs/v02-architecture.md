# v0.2 implementation plan

Base: 27c7f52c84f33e4ee69680524408f3887f266b63, branch party-panic-v02.

Preserve PeerJS room, channel ownership, Ammo host authority, ordered race triggers,
existing course input traversal, diagnostics, pause and disconnect handling.

1. G0 capture clean checks, screenshots and movement measurements before runtime edits.
2. G1 a focused DisplayMode owns browser fullscreen/orientation/wake state independently
   of round state. Start/Solo/Ready call enter synchronously from their gesture.
   Connection-owned Ready messages carry lobby revision/round identity. Denials do not block readiness.
3. G2 tune existing velocity capsule rather than replace it. Preserve bounded impulses,
   grounding probes, jump deduplication; add bounded guest jump response and reconcile.
4. G3 improve pacing/telegraphing/procedural feedback with primitive geometry.
5. G4 extend explicit protocol version with modeId and roundId. Keep one session/simulation
   orchestrator and two small mode implementations, owning only their geometry and rules.
   Clear interpolation on mode/round/respawn changes. Mode selection invalidates readiness.
6. G5/G6 implement deterministic, tested host-side segment intersections, cover occlusion,
   fire cooldown/replay protection, spawn protection and 90s score rules. Arena uses original
   primitives. Camera aims through reticle, muzzle-to-aimpoint checks prevent cover exploits.
7. User overrides brief: add visible, host-owned AI opponents for solo. Bots produce ordinary
   movement/aim/fire inputs and obey the same collision, cooldown and scoring rules.
   No simulated peers or fabricated multiplayer results.
8. G7 checks/review/production deployment through existing GitHub Pages workflow; record
   real browser evidence independently from physical-phone acceptance (unavailable here).

## Ownership

Root owns main.ts/protocol.ts/simulation.ts integration. Bounded agents may own focused
platform module, isolated mode logic/tests, movement/presentation or independent review.
Coordinate interfaces before shared file changes. Checkpoint at each passing gate.

## Transport and limits

Keep two PeerJS associations per guest until phone measurements justify replacement.
Actual movement channel retransmission behavior is inspected, not assumed from reliable:false.
No dedicated server, host migration, rollback or lag rewind. Physical mobile performance,
Safari fullscreen/orientation, NAT success and human playtest quality remain unverified.
