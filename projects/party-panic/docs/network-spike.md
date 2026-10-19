# Networking spike — 2026-10-19

Status: real desktop Chrome WebRTC proof PASSED in GitHub CI after the managed-browser failure described below. Real phones remain unavailable. The user explicitly approved proceeding with full gameplay while physical-device validation is pending.

The same transport runs the live lobby and game. Two separate PeerJS data connections per guest: ordered control and unordered movement. PeerJS 1.5.5 source (`dist/bundler.mjs`, Negotiator.startConnection) passes only `{ordered: !!options.reliable}` to `createDataChannel`. Therefore movement has **unlimited retransmissions**; `reliable:false` does NOT give lossy SCTP delivery. Sequence rejection prevents stale packets changing authority. DataChannel bufferedAmount is bounded before sending, snapshots full and small, movement has an independent association. A later transport change to expose maxRetransmits requires interoperability testing; no unsupported PeerJS configuration is assumed.

Diagnostics show selected candidate types, direct/relay classification where `getStats` exposes a selected pair, application RTT, application JSON bytes/messages per second and observed channel settings. Byte counts exclude SCTP/DTLS/IP/signaling overhead. No TURN servers configured. ICE candidate addresses are not exported. Test on the same Wi-Fi/hotspot first; internet is needed for initial loading and signaling. No claim of offline operation.

Fault injection is available only in the Vite development build with `?debug=1`: it applies explicit delay/jitter/loss/reordering to movement sends, not Chrome HTTP throttling. Reliable messages bypass injected faults. Timers cancel on teardown. Production has no debug globals or UI.

Physical-device acceptance remains NOT RUN: Android↔Android, Android host↔iOS Safari guest, iOS Safari host↔Android guest, eight phones, ten join attempts, host background/foreground and thermal/performance measurements. Desktop Chromium WebRTC proves only that environment's path, not mobile connectivity.

## Actual two-browser experiment

Executed public PeerJS Cloud signaling with two real Chromium pages in the managed workspace. Both peers received OPEN. Guest sent two OFFER messages, host received them and sent two ANSWER messages; guest received both answers. Neither association reached connected: iceConnectionState remained `new`, zero gameplay packets exchanged, no candidate pair selected, RTT unavailable. Test failed to join the guest. Repeated runs with the configured HTTP proxy showed the same failure. No mocked WebRTC was used.

Root cause evidence: `/etc/chromium/policies/managed/misc.json` sets `WebRtcIPHandling: disable_non_proxied_udp`. This is an environment policy; it was not modified or bypassed. Direct P2P cannot be certified in this managed browser. No relayed path was configured and no TURN deployment was added. This does not establish that ordinary phone browsers will fail, nor that they will succeed.

Actual observed PeerJS movement delivery flags: ordered=false, maxRetransmits=null (unlimited). ICE pair and gameplay RTT remain **unavailable**, not zero-latency successes. Software Chromium during this experiment reported roughly 10 FPS, which is not a device benchmark.

Initial managed-environment decision: GO for solo/gameplay implementation under the user's waiver; NO-GO for claiming verified phone multiplayer. This failure is preserved even though the later independent Chrome CI proof passed. Workstation reproduction: run `RUN_WEBRTC=1 npm run test:e2e -- tests/e2e/network.spec.ts` on an unrestricted development workstation, then the physical shared-Wi-Fi matrix. If ordinary-device NAT testing fails, evaluate an opt-in TURN service's privacy, operational cost and availability before adding it.

## Independent real Chrome proof — PASSED

The repository's normal GitHub-hosted runner executed the actual PeerJS transport using **Google Chrome 155.0.8059.39**, without a mock transport or TURN server. This uses the requested CI workflow, not a change to managed Chromium policy.

- [First successful run](https://github.com/LeoMaglanoc/LeoMaglanoc.github.io/actions/runs/39238538702), commit `2daa03c`: one full network E2E passed in 1.1 minutes.
- [Repeated successful run](https://github.com/LeoMaglanoc/LeoMaglanoc.github.io/actions/runs/39239258088), commit `a67f1f5`: repeated proof with payload byte counters and eight-client result evidence.
- Selected candidate pair: **host ↔ host, direct**. “Host candidate” is ICE terminology for a local-network candidate; there is still only one authoritative game host.
- Initial control RTT samples on the repeated run: **6.9ms host / 2.6ms guest**. These pings bypass the movement impairment adapter and are not Wi-Fi or impaired movement RTT promises.
- Actual movement delivery settings: **ordered=false, maxRetransmits=null/unlimited**, confirming the source review above.
- Two browser clients joined by share URL, synchronized countdown/racing, moved through guest inputs under **80ms ±40ms jitter, 3% movement packet loss and 5% reordering**, and reconciled within the tested 0.8m bound after stopping.
- A duplicate join did not create another player; spoofed finish input was rejected. The test then grew to **eight real connected browser clients**, rejected a ninth, handled a guest leaving as DNF, and synchronized seven finishers plus one DNF, results, rematch and host departure across remaining views. No uncaught page exceptions.
- Race progression in the multi-client result checks uses privileged **host-side test placement across real Ammo triggers**. The actual input-only full-course traversal is a separate solo test. Do not claim eight humans or eight input-driven full-course completions from these fixtures.
- The repeated eight-client stage recorded **22 live host physics-body allocations**. Session-average application payload bandwidth (including lobby/setup and changing client counts) was **40.69KiB/s TX / 2.05KiB/s RX**. This is not a steady-state eight-player bandwidth benchmark.

Machine-readable evidence: `evidence/chrome-webrtc-ci.json` and `evidence/chrome-webrtc-ci-final.json`. GitHub retains the full browser report in the run artifacts for seven days; the managed environment's artifact-download URL returned HTTP 403, so the committed summaries were extracted from successful run logs instead.

Updated recommendation: **GO for the provisional browser MVP and 1–8-client room flow. Physical Android/iOS connectivity, ordinary Wi-Fi join reliability, different-network NAT coverage, ten-minute phone performance and full human races remain acceptance gates.** No TURN deployment is justified by the managed browser policy failure or a same-VM desktop success alone. The next engineering priority is the real-phone shared-Wi-Fi matrix.

Final runtime confirmation: [Chrome CI run 39240738143](https://github.com/LeoMaglanoc/LeoMaglanoc.github.io/actions/runs/39240738143) also passed for commit `99d98c7`; `evidence/chrome-webrtc-release.json` preserves its diagnostic samples and eight-client outcomes. Missing candidate details now explicitly classify the path as **unknown**.
