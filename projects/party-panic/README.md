# Party Panic v0.2

Two original 3D party games: **Obstacle Dash** and **Laser Tag**. Play solo against
0/1/3/7 AI opponents, or host a persistent P2P room for 1–8 friends. PlayCanvas,
Ammo, TypeScript/Vite and PeerJS; no accounts or dedicated simulation server.

**Play:** https://leonardo-maglanoc.com/party-panic/

Physical Android/iPhone acceptance is still unverified. This is a provisional browser
release; viewport emulation and desktop Chrome networking do not certify phones.
Publication is currently pending a GitHub Pages incident; see [release status](docs/v02-release.md).

## Play

Choose a minigame and AI count, then Play Solo. Zero bots preserves solo practice.
Bots use the same host-authoritative movement, scoring and shot rules as people.
They are visibly marked AI and are rule-based opponents, not trained models.

Host a Party creates a QR/invitation link. Friends join and tap **READY — ENTER GAME**
on their own devices. The host selects a minigame and taps Start; countdown waits
for everyone ready. Switching games clears readiness and keeps the room connected.
Results return to the same lobby for rematch/switching. Multiplayer rooms use humans;
AI opponents belong to solo sessions.

- **Obstacle Dash:** joystick + Jump, or WASD/arrows + Space. Clear gaps, sweepers
  and bumpers, then both ordered checkpoints and the finish. Falls respawn quickly;
  hard timeout 120s. Results rank finish times and DNF progress.
- **Laser Tag:** joystick + right-side drag; hold and drag FIRE to aim while shooting.
  Desktop WASD/mouse + left click; Escape releases pointer lock. 90s free-for-all,
  one-hit tags, 3 shots/s, 25-unit range, 2s respawn and 1s spawn shield. Most tags wins;
  equal top scores display a tie. No reload, pickups, headshots or human aim assistance.

Start/Solo/Ready immediately attempt fullscreen, landscape and screen wake lock.
Browser refusal never blocks a game: portrait displays a manual-rotation hint.
iPhone fullscreen/orientation support varies. Exit Fullscreen is in the collapsible
Connection & performance panel. Results/rematches retain display mode; Leave releases it.

Keep the host tab visible: backgrounding pauses authority. Guest departure is handled;
host departure ends the session. No host migration or TURN server. Internet is needed
to load and signal; direct P2P only works where ICE succeeds. Same Wi-Fi is recommended.

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
Laser guests use authoritative movement interpolation and immediate cosmetic aim/fire;
Dash adds bounded jump feedback. No lag rewind or rollback.

See [v0.2 validation](docs/v02-validation.md), [baseline](docs/v02-baseline.md),
[movement comparison](docs/v02-movement.md), [Laser/AI](docs/v02-laser.md),
[network evidence](docs/v02-network.md), [architecture](docs/v02-architecture.md) and
[asset provenance](docs/assets.md). Earlier v0.1 evidence is preserved in validation.md;
its measurements apply to the recorded release, not automatically to v0.2.
