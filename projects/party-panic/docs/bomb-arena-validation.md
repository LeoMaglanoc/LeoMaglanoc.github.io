# Bomb Arena v0.4 release validation — 21 October 2026

## Implementation and decisions

Based on Party Panic v0.3 at `b5a28ab` (latest origin/main at task start).
Upstream reference: `20750b9c37a069831fbb88a41300b815ea006e0d` from
[statist32/bomberman_multiplayer](https://github.com/statist32/bomberman_multiplayer).
Implementation commit: `2303adf2e634290be3ae3e0fc6fc550e743d9236`.
The final delivery message records the deployed route and release evidence.

The upstream layered board, entity, obstacle, block, character, bomb and fire
architecture is ported to TypeScript; Draw.js's image cache and tile drawing
architecture is adapted to a dedicated 2D canvas. [Full reuse mapping and art
provenance](bomb-arena-source-review.md). All five PNGs and matching five Pixil
sources match upstream byte-for-byte: [hash manifest](evidence/bomb-arena/source-manifest.json).
MIT copyright/license and source notice ship at `bomb/{LICENSE,NOTICE}.txt`.

Fuses are 90 fixed ticks (1.5s), flames 30 ticks (0.5s), range two. A 9-tick
cardinal movement cadence replaces OS key-repeat speed: the same host rate
limit applies to joystick, keyboard and bots. Bomb edges are consumed once,
including rejected placements. No inventory or new abilities. Same-tick
explosions drain a guarded queue before determining winners; fire and players
do not terminate a ray, while solid walls and the first breakable do.

Compact deterministic handcrafted 13×9 (up to four) / 17×11 (five to eight)
layouts use reflected spawns with safe perimeter routes, two starting exits
and no overlap. All non-solid cells connect after breakables are removed.
There is no random map generator; `seed` records the authoritative round epoch.
Boards, inputs, outcomes and deadlines are tick driven. At 90 seconds multiple
survivors draw; zero survivors draw; one survivor wins. Zero-bot practice only
ends on death or deadline. Eliminated participants spectate.

Bomb Arena owns no Ammo bodies or 3D render components. PlayCanvas autoRender
is disabled in this mode, with an independent animation loop; the old modes
retain their existing engine loop. A version-4 protocol adds validated arena
snapshots and bomb edge inputs. Existing PeerJS authority, readiness, admission,
score/result/rematch and fullscreen lifecycle remain the session shell.

## Checks and failures

| Check | Result |
|---|---|
| Unmodified upstream Dockerfile / Chrome reference play | Ran successfully, no compatibility patches |
| Baseline Docker typecheck/lint/unit/build | Passed; 104 unit tests |
| Baseline browser suite | 24 passed, 2 optional WebRTC skips |
| Final `npm run check` | Passed; 120 unit tests, typecheck, lint, production build |
| Browser suite, original tests retained plus five Bomb viewports and seven bots | 30 passed, 3 optional WebRTC skips |
| Explicit `RUN_WEBRTC=1` network suite | All 3 passed, no skips (7.3 minutes locally) |
| Docker release build | Passed all build-stage checks and nginx artifact serving |
| Deterministic replay | Two fresh simulations produce deeply equal terminal arena states |

The ordinary suite's network skips are **not** counted as passes: the enabled
network run supplies that evidence. Commands used:

```sh
npm ci
npm run check
CHROMIUM_PATH=/usr/bin/google-chrome npm run test:e2e
CHROMIUM_PATH=/usr/bin/google-chrome RUN_WEBRTC=1 npm run test:e2e -- tests/e2e/network.spec.ts
CHROMIUM_PATH=/usr/bin/google-chrome node tools/bomb-performance.mjs
docker build --secret id=proxy_ca,src=/etc/ssl/certs/ca-certificates.crt -t party-panic-bomb-arena .
docker run -p 127.0.0.1:8088:80 party-panic-bomb-arena
```

Baseline and release command output is under `docs/evidence/bomb-arena/`
(saved logs have trailing whitespace normalized).
`replay-inputs.json` records the exact tick schedule used by the deep-equality
replay test. Focused tests cover walls, directional rate limits, occupancy and
escape, bomb duplication, exact fuse/fire lifetime, four rays, breakables,
solid blocking, chain idempotence, simultaneous deaths, existing fire contact,
practice/deadline/winners/disconnects, rematch reset, pause/resume and stale
rounds. Input tests cover held Space, touch clicks and pointer ownership/cancel.

Failed evidence is retained in `failed-first-pass/`: inherited pointer-events
initially prevented clicking the new canvas and button; explicit pointer
handling fixed this. Disabling PlayCanvas rendering initially stopped its
update callback; the independent loop fixed the countdown freeze. Overlapping
Playwright runs collided in their artifact directories (one Laser teardown
ENOENT) and a stressed seventh browser exceeded the existing Ammo load timeout.
Separate output directories and isolated reruns passed. A newly added profiling
script initially failed lint; ES module imports fixed it. These failures were
not relabeled as passes. Final isolated logs are separate.

## Actual Chrome computer use

Used the connected Chrome extension through `cua_repl`, not only automated
Playwright. The reference ran in Docker at localhost:3008. The port was played
through its real menu at localhost:5174, then the production nginx image at
localhost:8088/party-panic/. Captures were inspected visually.

Actions: selected Bomb Arena and three bots, started a round, moved with keys,
planted bombs, observed flames/destruction, elimination and winner results,
rematched and switched modes. At 844×390, 915×412 and 667×375, dragged the
joystick and activated BOMB. Tested 390×844 portrait and orientation changes.
Verified original sprites, framed arena, distinct colored identity rings,
readable controls, no scoreboard/joystick conflict, and no shooter/race actions
in Bomb Arena. Portrait works without forcing landscape. Fullscreen refusal
and unavailable orientation locking were observed and did not prevent play;
old display lifecycle refusal/retention cases also pass automatically.

Real touch emulation additionally used Chrome CDP touchStart/touchMove/touchEnd
and touchscreen taps in automated phone contexts. Computer-use joystick drags
used the connected browser's pointer interaction. This is browser emulation,
**not certification on physical Android or iPhone hardware**.

Connected Chrome rooms used eight real PeerJS participants, named Chrome Host,
Chrome Guest, Chrome Three/Four and Chrome 5–8. Two-player case: operated both
clients, moved, planted a guest bomb, and inspected matching host/guest winner
screens. Four-player case: started through readiness, planted guest bombs and
observed matching winner screens. Eight-player case: inspected all distinct
spawns and sprites, planted bombs from all seven guests, and inspected the
same Chrome Host winner on every client's results screen. Saved all eight UI
result texts and captured browser errors (none).

Existing modes were launched after Bomb Arena: Laser Tag movement/fire/aim and
Dash movement/jump/dive/camera drag were exercised; captured actual gameplay.
The full old automated suite and old real-WebRTC cases also passed.

Evidence highlights:

- `reference-{movement,bomb,flame,destruction,winner}.png` and chain captures.
- `chrome-{portrait-menu,844x390,915x412-bomb,667x375}.png` and portrait results.
- `chrome-two-{host,guest}.png`, `chrome-four-{arena,bombs,results}.png`.
- `chrome-eight-{arena,results}.png`, `chrome-eight-ui-results.json`.
- `chrome-eight-diagnostics.json` and `chrome-eight-stats.txt`.
- `docker-{desktop,landscape,portrait}.png` from the production image.
- `chrome-regression-{laser,dash-play}.png`.
- `automated-*.png` from actual Chrome canvas captures in the test suites.

Some screenshot labels describe the interaction sequence and can show the
immediately following result frame. No screenshots are manufactured. Videos
were not recorded; PNG captures, UI outcome text, logs and deterministic state
comparisons are the retained evidence.

## Real transport outcomes

[Machine-readable outcomes](evidence/bomb-arena/network-outcomes.json) record
2/4/8 players over real PeerJS/ICE direct host-to-host connections. At each
size all guests matched authoritative tiles, bombs, destroyed blocks, deaths,
scores and terminal arena state. Two players: host wins after guest elimination.
Four and eight: draw after an accelerated 90s deadline with multiple survivors.
The accelerated deadline cases are explicitly not 90 seconds of real waiting.
The eight-player live disconnect was eliminated by authority; rematches and
switching to both existing games passed. Forged guest world snapshots on both
channels were rejected. Old race/Laser network tests additionally exercise
transport delay, jitter, loss, duplicate/reordered packets and eight-client
traffic. Mode-specific malformed/stale/duplicate bomb cases are covered by the
input gates and deterministic tests.

This validates same-machine direct ICE. No TURN server, host migration or
adverse-NAT/WAN certification was added. The existing host-visible-tab rule
remains: backgrounding authority pauses the match.

## Performance and limits

[Reproducible measurement](evidence/bomb-arena/performance.json): Chrome
156.0.8078.47 headless SwiftShader, Linux x86_64 desktop (Intel i7-8565U,
8 logical CPUs), 844×390, one page with seven
legal-input bots; four active two-second samples and one result sample,
followed by five accelerated rematches. Separate connected Chrome computer
use reported Chrome 154 in its user agent. No CPU/network throttling was used. Docker checks used Node 24.22.1; host
browser automation used Node 22.22.0, below the package's declared minimum
22.23.2, so the supported-runtime build evidence is the Docker run.

Active samples: median about 60 FPS, lower fifth-percentile FPS 24–53 across
these short samples; sampled draw cost 0.3–0.5ms. Fixed-step simulation work
0.13–0.41ms per step. CDP main-thread TaskDuration share 11.6–14.0% over the
real-time samples (not whole-process or device CPU utilization). Local automated
keydown-to-authoritative movement was 25ms, including automation overhead;
this is not a physical touchscreen or remote-network latency claim.

JS heap after five rematches: about 48–54MiB; zero live Ammo bodies, zero 3D
render components and zero transient 3D entities throughout Bomb Arena.
Heap samples exclude WebAssembly/GPU/process memory and do not prove absence
of every possible leak. Sampled maxima: 11 bombs / 13 flame tiles, not an
exhaustive peak stress bound. Authoritative bounds limit bombs to 128 and
unique flame cells to the arena size.

Active eight-participant bot snapshots sampled 3.7–4.6KB. The real eight-human
terminal snapshot was 3,761 bytes, with 14 host PeerJS connections and zero
backpressure drops. Measured application payload between four- and eight-room
observations averaged 79.1KiB/s host TX and 4.2KiB/s RX; this interval includes
joining, countdown, gameplay and results, and excludes WebRTC framing overhead.
Raw counters and epochs are retained. Events use the existing small session
messages; bomb outcomes are carried in full bounded arena snapshots.

Eight simultaneous headless software-rendered browser contexts on one machine
were much slower (host median 5.2 FPS in that stress run); connected Chrome's
eight-tab sample included background pauses and a median 25.9 FPS. Those are
functional stress evidence, not phone or stable foreground performance claims.
Single-page phone-viewport performance above is separately measured. Cold
startup still loads the existing PlayCanvas/Ammo dependency before play.

## Deployment and rollback

The existing Pages workflow builds/tests and publishes dist at `/party-panic/`.
The demo-list blog entry now names Bomb Arena, Laser Tag and Obstacle Dash at
the existing route. Connectivity workflow time allowance increases to 20 minutes
to accommodate the third real network case. Reload older clients for protocol 4.

To roll back, revert the implementation commit that adds `src/bomb/model.ts`
with `git revert <implementation-commit>` and push main; let the normal Pages
workflow publish v0.3 again. Do not reset shared history or overwrite unrelated
local edits. Reload all peers together after rollback because v3/v4 clients
intentionally cannot share a room. No server/database migration is involved.
For a local comparison the pre-change image is `party-panic-bomb-baseline`.
