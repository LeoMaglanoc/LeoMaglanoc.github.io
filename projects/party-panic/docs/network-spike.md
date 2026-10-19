# Networking spike — 2026-10-19

Status: implementation complete; browser connection experiments in progress. Real phones unavailable. User explicitly approved proceeding with full gameplay with physical-device validation pending.

The same transport runs the live lobby and game. Two separate PeerJS data connections per guest: ordered control and unordered movement. PeerJS 1.5.5 source (`dist/bundler.mjs`, Negotiator.startConnection) passes only `{ordered: !!options.reliable}` to `createDataChannel`. Therefore movement has **unlimited retransmissions**; `reliable:false` does NOT give lossy SCTP delivery. Sequence rejection prevents stale packets changing authority. DataChannel bufferedAmount is bounded before sending, snapshots full and small, movement has an independent association. A later transport change to expose maxRetransmits requires interoperability testing; no unsupported PeerJS configuration is assumed.

Diagnostics show selected candidate types, direct/relay classification where `getStats` exposes a selected pair, application RTT, application JSON bytes/messages per second and observed channel settings. Byte counts exclude SCTP/DTLS/IP/signaling overhead. No TURN servers configured. ICE candidate addresses are not exported. Test on the same Wi-Fi/hotspot first; internet is needed for initial loading and signaling. No claim of offline operation.

Fault injection is available only in the Vite development build with `?debug=1`: it applies explicit delay/jitter/loss/reordering to movement sends, not Chrome HTTP throttling. Reliable messages bypass injected faults. Timers cancel on teardown. Production has no debug globals or UI.

Physical-device acceptance remains NOT RUN: Android↔Android, Android host↔iOS Safari guest, iOS Safari host↔Android guest, eight phones, ten join attempts, host background/foreground and thermal/performance measurements. Desktop Chromium WebRTC proves only that environment's path, not mobile connectivity.

## Actual two-browser experiment

Executed public PeerJS Cloud signaling with two real Chromium pages in the managed workspace. Both peers received OPEN. Guest sent two OFFER messages, host received them and sent two ANSWER messages; guest received both answers. Neither association reached connected: iceConnectionState remained `new`, zero gameplay packets exchanged, no candidate pair selected, RTT unavailable. Test failed to join the guest. Repeated runs with the configured HTTP proxy showed the same failure. No mocked WebRTC was used.

Root cause evidence: `/etc/chromium/policies/managed/misc.json` sets `WebRtcIPHandling: disable_non_proxied_udp`. This is an environment policy; it was not modified or bypassed. Direct P2P cannot be certified in this managed browser. No relayed path was configured and no TURN deployment was added. This does not establish that ordinary phone browsers will fail, nor that they will succeed.

Actual observed PeerJS movement delivery flags: ordered=false, maxRetransmits=null (unlimited). ICE pair and gameplay RTT remain **unavailable**, not zero-latency successes. Software Chromium during this experiment reported roughly 10 FPS, which is not a device benchmark.

GO: solo game, host physics and deterministic rules/UI validation under the user's explicit waiver. NO-GO: claim verified 2–8 phone multiplayer or mobile performance. Next connectivity priority: run `RUN_WEBRTC=1 npm run test:e2e -- tests/e2e/network.spec.ts` on an unrestricted development workstation, then the physical shared-Wi-Fi matrix. If ordinary-device NAT testing fails, evaluate an opt-in TURN service's privacy, operational cost and availability before adding it.
