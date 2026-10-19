# Validation — provisional MVP

Physical-device acceptance: **NOT RUN**. No Android or iOS devices attached. User explicitly approved full implementation with this risk pending. No gameplay recording from real phones exists. Do not treat viewport emulation, software rendering or eight desktop tabs as eight-phone certification.

## G0 baseline

- Official scaffold command and original main/controller retained in architecture docs.
- `npm ci`: passed (422 packages).
- `npm run typecheck`: passed.
- `npm run lint`: passed before E2E additions.
- `npm run build`: passed with expected large PlayCanvas bundle warning.
- Baseline commit: `c18a508`.

## Required physical matrix (all pending)

Record model/OS/browser, Wi-Fi/hotspot, role, candidate pair type, join time/success over 10 attempts, RTT p5/median/p95, JSON bandwidth and messages/s, median/p5 FPS over 10 minutes, memory trends and failures. Use Save diagnostics per device.

| Scenario                                   | Result                   |
| ------------------------------------------ | ------------------------ |
| Android Chrome host + Android Chrome guest | NOT RUN                  |
| Android Chrome host + iOS Safari guest     | NOT RUN                  |
| iOS Safari host + Android Chrome guest     | NOT RUN                  |
| Two real phones finish race                | NOT RUN                  |
| Eight physical phones stress test          | NOT RUN                  |
| Repeated physical rematches / memory       | NOT RUN                  |
| Host background/resume and tab killed      | NOT RUN on phones        |
| Guest disconnect mid-race                  | Pending browser evidence |
| Different-network / blocked NAT failure UI | Pending browser evidence |

## Targets, not promises

9/10 joins within 15 seconds after loading, >=45 median / >=30 p5 FPS on midrange phones, 60–90-second course completion, no severe corrections on ordinary shared Wi-Fi. None is certified until recorded on physical devices. No claims about Android↔iOS connectivity or thermal stability.

Automated evidence and final limitations are appended below after test execution.

## Gameplay/browser evidence

- After fixing world-initialization order, real Ammo capsule tests passed: ten consecutive jumps land at y≈0.75; ordered checkpoint skip rejection; out-of-bounds respawn at CP1; valid CP2/finish; 120s timeout to DNF; rematch reset.
- Three consecutive eight-capsule host-only rematches passed. These fixtures use host-side test placement across real trigger volumes. They are NOT full-course network races or eight devices.
- An additional **input-only** solo traversal completed the actual three-section course in **61.94 authoritative seconds**, with both checkpoints, no respawns and a host-authoritative finish. The scripted test sends movement/jump inputs, waits for pushers and never teleports. This is nominal simulation tuning evidence, not a human playtest or wall-clock mobile benchmark.
- Desktop 1440×900, phone portrait 390×844 and phone landscape 844×390 Chromium viewport tests passed: home actions and touch controls remain in viewport; joystick movement and jump change real authoritative physics; no page scroll; no uncaught runtime errors. Device emulation does not certify Safari or physical input ergonomics.
- Keyboard movement and Space jump passed in Chromium. Initial test key-code mistake was fixed to send the actual `w` key.
- `npm run check`: typecheck/lint, 14 Vitest checks, production build passed. Vite warns about the engine bundle (~340KB gzip); Ammo is separately cached and locally shipped. No fake performance target claimed.
- `npm run test:e2e`: initial complete pass was 6 passed, 1 explicitly skipped (public-network test). The public PeerJS test was separately executed and FAILED at ICE, as documented in network-spike.md. Final expanded suite results are appended after execution.
