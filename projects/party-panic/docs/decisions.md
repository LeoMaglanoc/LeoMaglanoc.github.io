# Decision log

- 2026-10-19: User requested complete implementation in one pass, explicitly approved proceeding with physical-device connectivity/QA pending, and asked to publish on the existing website/blog demos list.
- Official create-playcanvas 0.10.1 engine/third-person-controller starter used. Kept baseline snapshots in docs; replaced local input/controller assumptions for host authority, dedicated jump input, and automatic follow camera.
- Solo practice allowed through the same authoritative race. Min players changes from 2 to 1 as requested; no bots.
- PlayCanvas 2.23.3, PeerJS 1.5.5, QRCode 1.5.4. Lockfile pins transitive dependencies. Ammo from official starter; provenance and SHA-256 retained.
- Physics fixed-step 60Hz, maximum six simulation steps/frame. Physics catch-up is bounded; the active race clock still counts excess wall time to enforce the 120-second deadline. Overloaded hosts may simulate slow movement without extending the deadline. Mobile performance is a release risk until measured.
- Two PeerJS connections per guest: ordered control, unordered movement. Verified source only sets `ordered` and does not limit retransmissions. Document actual behavior, sequence filtering and bounded buffering rather than claim unreliable delivery.
- Player-player collisions disabled for stable jumping. No eight-phone stability benchmark available; revisit after measured device results.
- No TURN or signaling backend added. Connectivity failures must be reported, not replaced by simulated multiplayer.
- GitHub Pages chosen to match the user's actual website. Isolated `projects/party-panic`; only deployment integration, stable route checker and one demos-post link change outside it.
- Chromium/Playwright substitutes for unavailable Chrome computer-agent tools. Portrait/landscape emulation is not physical Android/iOS QA.

- Review fixed an initialization-order defect: Ammo's world must initialize before static terrain and triggers are constructed. A loaded WASM module alone is insufficient. The ten-jump/trigger browser tests now exercise actual contacts.
- Review fixed same-tick lifecycle snapshots: transmission sequence is separate from simulation tick, so pause/roster changes at a frozen tick are not discarded. Snapshot player arrays are copied before debug delay injection to preserve sent-state semantics.
- Render polish: shared unlit StandardMaterials, static batches (45m maximum bounds), no shadow maps, capped device pixel ratio 1.5, locally hosted OFL fonts, HUD updates at 10Hz. FPS samples use actual performance timestamps rather than PlayCanvas's clamped delta.
- Trusted host simulation is bounded to six catch-up steps per render frame. Active wall-clock excess still advances the round clock; visibility pause resets the frame timestamp, preserving the hard deadline without counting paused time.
