# Party Panic v0.4

Three party games: **Obstacle Dash**, **Laser Tag**, and **Bomb Arena**. Play solo against
0/1/3/7 AI opponents, or host a persistent P2P room for 1–8 friends. PlayCanvas/Ammo for the 3D modes, a 2D canvas for Bomb Arena, TypeScript/Vite and PeerJS; no accounts or dedicated simulation server.

**Play:** https://leonardo-maglanoc.com/party-panic/

Physical Android/iPhone acceptance is still unverified. This is a provisional browser
release; viewport emulation and desktop Chrome networking do not certify phones.
Release evidence and open gates: [v0.3 validation](docs/v03-validation.md).

## Play

Choose a minigame and AI count, then Play Solo. Zero bots preserves solo practice.
Bots use the same host-authoritative movement, scoring and shot rules as people.
They are visibly marked AI and are rule-based opponents, not trained models.

Host a Party creates a QR/invitation link. Friends join and tap **READY — ENTER GAME**
on their own devices. The host selects a minigame and taps Start; countdown waits
for everyone ready. Switching games clears readiness and keeps the room connected.
Results return to the same lobby for rematch/switching. Multiplayer rooms use humans;
AI opponents belong to solo sessions.

- **Obstacle Dash:** joystick + held Jump + Dive, or WASD/arrows + held Space and Shift.
  Release Jump early for a short hop; drag the playfield to orbit the camera. Clear gaps, sweepers
  and bumpers, then both ordered checkpoints and the finish. Falls respawn quickly;
  hard timeout 120s. Results rank finish times and DNF progress.
- **Laser Tag:** joystick + right-side drag; hold and drag FIRE to aim while shooting.
  Desktop WASD/mouse + left click; Escape releases pointer lock. 90s free-for-all,
  100 health, Quick (4 shots/s, 34 damage) and Charged (hold to prepare, 70 damage)
  blasters. Tap weapon buttons or 1/2; both share recharging energy. 25-unit range,
  2s respawn and 1s spawn shield. Most eliminations wins;
  equal top scores display a tie. No reload, pickups, headshots or human aim assistance.

Enter Party Panic on the main menu, Host, Join, Solo, invitation Continue, Start and
Ready attempt fullscreen in a genuine gesture, then landscape and screen wake lock.
Browser refusal never blocks a game: portrait displays a manual-rotation hint.
iPhone fullscreen/orientation support varies. Exit Fullscreen is in the collapsible
Connection & performance panel. Results, rematches, mode switching and Leave retain display mode. Explicit Exit
Fullscreen or browser Escape releases it; the app never forces automatic reentry.

Keep the host tab visible: backgrounding pauses authority. Guest departure is handled;
host departure ends the session. No host migration or TURN server. Internet is needed
to load and signal; direct P2P only works where ICE succeeds. Same Wi-Fi is recommended.

- **Bomb Arena:** WASD/arrows or left joystick; Space or BOMB plants once per press.
  Original pixel art and adapted grid rules from statist32's MIT game. 1.5s fuse,
  0.5s flames, range-two cross blasts. Solid walls block; breakable walls stop
  one ray and disappear. Bombs chain immediately. Death means spectating until
  the last survivor or 90s deadline. Zero survivors or multiple survivors at the
  deadline draw. Zero-bot practice stays playable. No inventory or powerups.
  Compact symmetric 13×9 / 17×11 boards support 1–8 participants. Mode protocol
  version is now 4: reload older clients before joining.

## Develop and test

Node ≥22.23.2; local validation uses 24.19.0.

```sh
npm ci
npm run dev
# http://localhost:5173/party-panic/
npm run check
npm run test:e2e
```

Playwright defaults to `/usr/bin/chromium`; override `CHROMIUM_PATH`. Two network tests
are explicitly skipped unless enabled:

```sh
RUN_WEBRTC=1 npm run test:e2e -- tests/e2e/network.spec.ts
```

Use an unrestricted Chrome environment or the existing Party Panic Chrome connectivity
workflow. Managed Chromium here blocks non-proxied UDP; HTTP throttling is not a WebRTC
loss simulation. The network tests use real PeerJS/ICE, real engine inputs and no mock
transport. Tests that accelerate host time are labeled; isolated race trigger tests
use debug placement, while full-course and bot checks use input-only traversal.

For development-only fault injection use `?debug=1`. Faults support movement delay,
jitter/loss/reordering, ordered reliable delay and duplicates. Debug APIs compile out
of production. Do not publish the Vite development server as the game.

## Deployment and diagnostics

The existing GitHub Pages workflow builds/tests this project and copies `dist/` to
`_site/party-panic/`. Preserve Vite base `/party-panic/`; Ammo and fonts ship locally.
Do not commit generated builds or node_modules. HTTPS is needed on phones.

The existing Docker setup remains available with `docker compose up --build` at
`http://localhost:8080/party-panic/`. See Dockerfile for build checks and proxy CA support.

Connection & performance shows frame estimate, RTT, actual ICE/channel properties,
application payload counters and backpressure drops. Save diagnostics includes display
API outcomes and bounded logs. It excludes IP addresses; payload counters exclude
WebRTC overhead. Two PeerJS associations per guest mean 14 host connections at capacity.
Laser guests use bounded collision-aware visual prediction with input acknowledgements
and replay against shared arena cover; host Ammo still owns all outcomes. Remote
players interpolate snapshots. Dash adds bounded jump feedback. No lag rewind.

See [v0.3 validation](docs/v03-validation.md), [baseline](docs/v03-baseline.md),
[gameplay decisions and measurements](docs/v03-gameplay.md),
[display lifecycle](docs/v03-display.md) and [asset provenance](docs/assets.md).
Historical v0.1/v0.2 reports remain under docs; their measurements apply only to
those recorded releases. Human preference and physical-device acceptance remain open.

Bomb Arena source reuse and provenance: [review](docs/bomb-arena-source-review.md).
Validation and rollback: [release notes](docs/bomb-arena-validation.md).
