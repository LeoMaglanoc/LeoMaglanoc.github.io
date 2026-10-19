# Party Panic v0.2 architecture

## Runtime and ownership

GitHub Pages serves static HTTPS assets (Vite/TypeScript, PlayCanvas2.23.3, local Ammo).
PeerJS Cloud signals a star of one trusted browser host and up to7guests. Physics and
scores run on the host; no dedicated simulation server, accounts, database, migration,
TURN or offline multiplayer claim. Solo uses that same host with0/1/3/7 labeled bots.

`main.ts` owns room/UI/round orchestration and accepted peer identities. `transport.ts`
owns the existing two PeerJS associations per guest, counters, real channel inspection
and a debug fault adapter. `protocol.ts` validates versioned, connection-bound input.
`simulation.ts` owns the roster, clock, phases, authoritative capsule motion and mode
selection. `rules.ts` owns race progress/results. `laser.ts` owns original arena data,
shared aim/camera/intersection math and fire/spawn rules; `laserRound.ts` owns Laser tags,
protection and respawn. `bots.ts` generates ordinary inputs without mutating world state.
`scene.ts` renders both worlds and host physics; `input.ts` handles pointer/keyboard controls.
`platform/displayMode.ts` independently manages browser display/wake state.

## Protocol v2

Join explicitly rejects other versions. Inputs, snapshots and authoritative events name
`modeId` and `roundId`; Ready names the same current selection. Epoch advances on mode
selection, start and rematch. Old rounds/modes are rejected before accepting a sequence.
Only accepted connection identity determines the controlled player. Guests cannot send
position, hit, score or finish claims. Full snapshots carry monotonically increasing
transmission sequence and tick; histories reset on epoch change and snap on respawn.

Reliable control carries joins/readiness/lifecycle/host effects and recovery snapshots.
Movement lane carries30Hz normalized inputs and20Hz full snapshots. Reliable recovery
runs1Hz and on lifecycle/respawn. No per-shot full reliable snapshot. Actual unordered/
retransmission channel properties are inspected; `reliable:false` is not a limited-retry
guarantee. At8players the host has14 RTCPeerConnections. Guest input control budget30/s;
authoritative host traffic budget128/s; movement90/s plus75/s connection input gate.

## Two explicit modes

Lobby → host-selected mode → all-ready →3s countdown → play → results → same lobby.
Switching mode invalidates readiness and clears mode state without resetting transport.
Each world has one parent entity. Disposal destroys that world's batch group, triggers,
physics bodies and transients; player bodies/models recreate for the new mode. There
is no generic game framework or third minigame. Repeated mode/body-count tests verify
ownership. Race timeout120s; Laser90s. Disconnects cannot score; host departure ends play.

Dash preserves ordered checkpoints, five-ray capsule grounding,100ms buffer/coyote,
2.8speed/7.5jump/18gravity. Vector acceleration fixes direction-dependent response.
Guests interpolate remote actors100ms and use bounded cosmetic local jump feedback
plus horizontal approximation. The host alone changes race progress. Player bumping
remains disabled; obstacle impulses remain bounded and authoritative.

Laser movement4.8; bounded yaw/pitch aim and monotonic fire sequences drive host capsule
intersections at3shots/s within25units. Shared cover AABBs drive Ammo, rendering, camera
clipping and authoritative rays. Camera aimpoint then muzzle line-of-sight prevents
cover exploits. One hit gives one tag,2s respawn,1s visible shield. Protected capsules
absorb shots; no duplicate deaths/farming. Ties display explicitly. No aim assist,
headshots, server rewind or rollback. Laser guests use authoritative interpolation,
not unconstrained local movement prediction; local aim/tracers/audio respond immediately.

## Browser lifecycle and measurement

Start/Solo/Ready invoke fullscreen synchronously inside their own gesture. Orientation
and wake requests may fail; actual API/viewport state is reported independently. Safe
areas and visual viewport size drive canvas/HUD. Portrait remains playable with a hint.
No CSS rotation, forced incoming-message fullscreen or automatic reentry after Escape.
Leave releases locks. Host visibility pauses/clears authority; browser suspension still
cannot be prevented. Cache restoration cannot revive a closed party connection silently.

Frame/RTT samples are bounded and scoped by role/room/mode/epoch, with measured phases
reported; counters/bandwidth are page-lifetime application payloads excluding overhead.
Software-rendered/browser-emulated results do not certify physical phone performance.
Debug APIs exist only in development. See v02-network.md for current CI evidence and
v02-validation.md for missing physical-device/human playtests.

Historical v0.1 release evidence remains in validation.md/network-spike.md and Git history.
