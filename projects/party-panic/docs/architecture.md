# Party Panic architecture

## Runtime and trust
Static HTTPS (GitHub Pages) serves Vite/TypeScript and PlayCanvas. PeerJS Cloud provides signaling only. One browser is the trusted host; up to seven guests connect directly to it in a star. No database, accounts, dedicated simulation server, host migration, TURN deployment, or offline claim. Solo practice uses the same host simulation without signaling.

Only the host creates Ammo dynamic capsules and collision outcomes. Terrain uses static boxes; scripted sweepers/pushers use kinematic boxes; ordered checkpoint and finish triggers are host-owned. Guest scenes contain visual entities, no physics authority. Inputs are associated with the connection, never with a supplied player ID. Host validates types, sizes, rates, sequence monotonicity and bounds; unknown messages (including position/finish claims) are rejected.

## Boundaries
`protocol.ts`: wire schemas/validation. `transport.ts`: PeerJS channels, diagnostic counters, ICE stats, fault injection. `rules.ts`: phase, ordered progression, scoring. `scene.ts`: PlayCanvas entities/camera. `simulation.ts`: host movement/physics and race. `input.ts`: keyboard and pointer controls. `main.ts`: session and UI integration. Only Obstacle Dash is registered; a future mode reuses identities, round transitions, transport and result format.

## Protocol v1
Reliable ordered control: join(version,nickname), welcome(assigned identity), roster, state snapshots for recovery, errors, authoritative events(eventId,tick,type,payload). Separate `movement` channel: JSON, `reliable:false` (verify actual RTCDataChannel ordered/maxRetransmits in diagnostics). Guests send `{type:input,sequence,axes:[x,z],jumpSequence,clientTime}` at 30Hz, repeating the monotonic jump sequence until observed; host sends full snapshots at 20Hz. Snapshots contain tick, phase, round elapsed/countdown, paused state and authoritative positions/velocities/progress/results. Superseded ticks and input sequences are discarded. A reliable full snapshot every second and on lifecycle transitions recovers missing state. Channel identity must match the accepted control connection.

## Lifecycle
Home → solo/host/join → lobby → synchronized host-timed 3s countdown → race → results → lobby/rematch. Host may start with one player (user override); room capacity eight. A round lasts at most 120s. Guests disconnecting after start become DNF; host loss ends the session. No implicit reconnection or migration. Host visibility change pauses simulation, clears movement, broadcasts full state; resume sends state before continuing. Snapshot silence shows an inactive warning; prolonged silence ends the session.

## Simulation and rendering
PlayCanvas fixed physics target 60Hz, max catch-up bounded. Host movement executes before physics; race checks after physics. Ground/air acceleration, speed cap, capsule upright constraint, 100ms coyote/buffer, edge-preserving jump, safe respawn and grace. Guest local visual prediction is an isolated velocity approximation reconciled to host snapshots; remote players interpolate between buffered snapshots. It is not a physics replica. Dynamic obstacles are derived from authoritative round time. Player collision disabled initially: preserve stable jumping; eight-phone bump benchmark is pending.

## Risks and acceptance
WebRTC may fail across NAT/firewalls without TURN. iOS host background suspension cannot be prevented. Mobile GPU/thermal performance, input ergonomics, 60–90s course tuning and physical Android↔iOS connectivity require real devices. Chromium emulation is layout and browser testing only. On 2026-10-19 the user explicitly authorized proceeding with the complete game while real-phone connectivity/QA remain pending. Test evidence must label this release provisional.

## Official baseline and references
Scaffold: `npm create playcanvas@0.10.1 party-panic -- --format engine --starter third-person-controller --no-skills --yes`. Original scaffold main/controller retained as text in this folder. Read engine ThirdPersonController (velocity capsule, center ray grounding, camera orbit) and starter edge probes. Replaced input/controller integration to separate host authority from local rendering, use capsule and explicit jump edges, and remove manual orbit.
- https://github.com/playcanvas/create-playcanvas
- https://developer.playcanvas.com/user-manual/engine/
- https://api.playcanvas.com/engine/classes/RigidBodyComponent.html
- https://github.com/playcanvas/engine/blob/main/scripts/esm/third-person-controller.mjs
- https://peerjs.com/docs/
- https://github.com/peers/peerjs

See package-lock.json for exact versions and public/ammo/SOURCE.md for pinned WASM provenance.
