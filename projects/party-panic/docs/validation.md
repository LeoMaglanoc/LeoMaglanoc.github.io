# Validation — provisional browser MVP

**Published demo:** https://leonardo-maglanoc.com/party-panic/

**Demos post:** https://leonardo-maglanoc.com/blog/AI-coding-agent-case-study/

The user explicitly authorized full implementation while physical-device testing remains pending. No Android/iOS acceptance, real-device recording, eight-phone stress test or mobile performance certification is claimed. Desktop browser WebRTC proof has passed independently in real Chrome CI.

## Reproducible commands and actual outcomes

| Command/check                                                                  | Actual result                                                                                                                                    |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Official `create-playcanvas@0.10.1` engine / third-person starter              | Scaffolded and inspected; original main/controller retained in docs                                                                              |
| `npm ci`                                                                       | Clean install passed; final Docker install added 182 dependency packages                                                                         |
| `npm run typecheck`                                                            | Passed, including runtime, tests and Vite/Vitest/Playwright configs                                                                              |
| `npm run lint`                                                                 | Passed                                                                                                                                           |
| `npm test`                                                                     | 16 Vitest checks passed: schemas/bounds, admissions, transitions, jumps, progression/scoring, disconnection, snapshot ordering and fault cleanup |
| `npm run build`                                                                | Passed; production JS ≈340KB gzip, plus local Ammo assets; expected large-engine-chunk warning                                                   |
| `npm run test:e2e`                                                             | 9 passed, 1 explicitly skipped locally: public P2P test blocked by managed Chromium policy                                                       |
| `RUN_WEBRTC=1 npm run test:e2e -- tests/e2e/network.spec.ts` in real Chrome CI | Passed twice, 2→8 actual clients, direct ICE, no mock transport or TURN                                                                          |
| `docker build --secret id=proxy_ca,src="$CODEX_PROXY_CERT" -t party-panic .`   | Passed install/typecheck/lint/tests/build inside Node 24.22.0 image                                                                              |
| Docker nginx production QA                                                     | Desktop, portrait and landscape load/play passed with HTTP 200, no asset/runtime errors, no debug API and no page scroll                         |
| GitHub Pages deploy                                                            | Successful; HTTPS demo and blog link verified live                                                                                               |

Versions: local Node 24.19.0, Docker Node 24.22.0/nginx 1.28.3, Chromium 154.0.8037.57, real CI Chrome 155.0.8059.39. Full package pins are in package-lock.json and versions.md.

## Gameplay invariants actually exercised

- Real Ammo contacts: ten consecutive buffered/edge-preserving jumps land consistently around y=0.75; a second midair press does not create another jump.
- Ordered checkpoint skip rejection; valid CP1/CP2; out-of-bounds safe respawn with velocity reset; authoritative finish; active wall-clock timeout; pause/resume clock behavior.
- An **input-only solo test** traverses the actual gaps, sweepers and pushers and finishes with both checkpoints. Across recorded runs it took **58.24–80.42 simulated seconds**, including a run with one fall. This is nominal course tuning, not a human or phone wall-clock benchmark.
- Three eight-capsule host rematches keep tracked body allocations stable at 22. Leaving solo returns from 15 bodies to the 14-body course baseline. This checks body cleanup; it does not certify native or JS heap stability over ten minutes.
- The independent real Chrome network E2E connects 2 then 8 clients through PeerJS Cloud, records direct ICE, exercises 80ms ±40ms / 3% loss / 5% reorder, validates input ownership/fake-finish rejection, duplicate/full-room handling, guest DNF, synchronized results/rematch and host departure.
- Multi-client result checks use privileged host-side test placement over actual triggers. They are not eight human or eight input-driven course completions. Solo full-course traversal and real multi-client networking are separate evidence.
- Loading actions stay disabled until Ammo/scene initialization completes; an intercepted slow-glue browser test verifies the startup guard.

## Chrome/Chromium viewport matrix

| Viewport                | Actual checks                                                                                            |
| ----------------------- | -------------------------------------------------------------------------------------------------------- |
| Desktop 1440×900        | Home actions visible; keyboard and pointer movement/jump; course and camera render; zero page errors     |
| Phone portrait 390×844  | Joystick/jump remain visible and move real host physics; rotation hint; no page scroll; zero page errors |
| Phone landscape 844×390 | Landscape action layout and touch controls fit; movement/jump work; no page scroll; zero page errors     |

Reproduce production checks with `node tools/production-qa.ts` against Docker, or set `PARTY_URL=https://leonardo-maglanoc.com/party-panic/ PARTY_QA_LABEL=live`. The matrix was exercised in development, nginx's production bundle and the public HTTPS app. Development tests assert real state; production checks assert successful loading, playable countdown/HUD, no missing assets and absence of debug globals. These are viewport tests, not physical touch/thermal/Safari certification. Screenshots and JSON reports are in `evidence/`.

## Network evidence and limits

[First real Chrome run](https://github.com/LeoMaglanoc/LeoMaglanoc.github.io/actions/runs/39238538702) and [repeat with bandwidth/body counts](https://github.com/LeoMaglanoc/LeoMaglanoc.github.io/actions/runs/39239258088) both passed. Direct host-candidate ICE, control RTT samples 6.9/2.6ms on the repeated run, and actual unordered/unlimited-retransmission delivery flags are recorded in `evidence/chrome-webrtc-ci-final.json`. Short-session host averages were 40.69KiB/s payload TX and 2.05KiB/s RX, including setup/lobby/changing client counts. No steady-state eight-phone bandwidth or FPS claim is made.

The earlier real two-browser attempt in this workspace failed: managed Chromium enforces `WebRtcIPHandling=disable_non_proxied_udp`; offers/answers exchanged but no ICE pair formed. That policy was preserved. network-spike.md retains the failure and the later independent success. Real Chrome CI is a different, supported validation environment and does not establish phone or different-network NAT connectivity.

## Physical acceptance — ALL NOT RUN

| Scenario                                                           | Result                                                             |
| ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| Android Chrome host + Android Chrome guest                         | NOT RUN                                                            |
| Android Chrome host + iOS Safari guest                             | NOT RUN                                                            |
| iOS Safari host + Android Chrome guest                             | NOT RUN                                                            |
| Two phones complete a full race                                    | NOT RUN                                                            |
| Eight physical phones / input-driven full race                     | NOT RUN                                                            |
| Ten join attempts within 15 seconds                                | NOT RUN                                                            |
| Host background/foreground, suspension and tab kill                | NOT RUN on phones; simulation pause and browser host-leave covered |
| Repeated physical rematches / ten-minute memory and thermal trends | NOT RUN                                                            |
| Different networks or difficult NAT/firewall                       | NOT RUN                                                            |

Record model/OS/browser, Wi-Fi/hotspot, role, selected ICE path, join outcomes/time, RTT distribution, payload bandwidth/message rates, median/p5 FPS, memory trends and failures. Save diagnostics per device. Targets (9/10 joins in 15s, >=45 median / >=30 p5 FPS on midrange phones) remain targets.

## Remaining limitations and next priority

Player-player bumping is disabled; obstacle collisions remain authoritative. The host is trusted, migration is absent, and browser suspension cannot be prevented. There is no TURN configuration, so difficult NAT/firewalls can fail clearly. Each guest currently uses two PeerJS associations (14 on a full host); benchmark phone memory/CPU before changing transport.

**Next engineering priority:** complete Android↔Android and Android↔iOS shared-Wi-Fi acceptance, then human races and ten-minute eight-player performance/memory measurements. Use measured evidence to decide whether to consolidate data channels, tune prediction or evaluate opt-in TURN. No trained models exist in this project; Git commits/tags preserve source, geometry and movement tuning.

## Final verified release

Runtime commit **`99d98c7bf19e50fa57817178ed54d93797c0099e`** passed [deployment and browser/unit checks](https://github.com/LeoMaglanoc/LeoMaglanoc.github.io/actions/runs/39240738154) and [real two-to-eight-client Chrome networking](https://github.com/LeoMaglanoc/LeoMaglanoc.github.io/actions/runs/39240738143). The final public JS asset is `index-C6rFjFDh.js`; all three public HTTPS viewport reports verified that exact asset, HTTP 200, no runtime/asset errors, no page scroll and no debug API on 2026-10-19. The blog's `/party-panic/` link was fetched and verified.

- `evidence/live-qa.json`: final HTTPS checks and screenshot references.
- `evidence/production-qa.json`: final Docker image `sha256:267391bbe54bbd2194d5c748554af8143b804d6cc58090c0f06b86e45ae3aba6`, same asset and three viewports.
- `evidence/chrome-webrtc-release.json`: final runtime's real Chrome network proof; earlier CI summaries preserve the investigation history.
- `evidence/local-browser-results.json`: nine passing local gameplay/layout/startup tests and one explicit managed-network skip. The final CI deployment also ran the local browser suite in Google Chrome.
- `checkpoints.md`: source/tuning commits and the final `party-panic-mvp-v0.1.0` tag.

Documentation/reproduction-helper changes after the runtime release do not change the deployed bundle. The source and lockfile are preserved for continued work. Physical-device acceptance and real-device recording remain NOT RUN.
