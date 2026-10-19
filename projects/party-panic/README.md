# Party Panic · Obstacle Dash

Original 3D browser party race: solo practice or one trusted host and up to seven friends. PlayCanvas + Ammo physics, TypeScript/Vite, PeerJS. No accounts, database, or dedicated game server. This MVP is provisional until physical-phone acceptance is completed.

## Run

Node >=22.23.2 (validated with 24.19.0):

```sh
npm ci
npm run dev
# http://localhost:5173/party-panic/
npm run check
npm run test:e2e
```

Playwright uses installed Chromium at `/usr/bin/chromium`. Override `CHROMIUM_PATH` as needed. On another workstation install Chrome/Chromium or `npx playwright install chromium` and point to its executable. Browser tests run against an already running development server; `PARTY_URL` can select another origin. Tests requiring public PeerJS signaling are real network tests, not mocked transport.

## Docker

```sh
docker compose up --build
# http://localhost:8080/party-panic/
```

The image runs checks, tests and production build, then serves only static assets with nginx. For a corporate proxy set `CODEX_PROXY_CERT` to its CA bundle. Compose defaults to the system trust bundle. Direct build in the managed workspace:

```sh
docker build --secret id=proxy_ca,src="$CODEX_PROXY_CERT" -t party-panic .
docker run --rm -p 8080:80 party-panic
```

Phones need deployed **HTTPS**, or a trusted local HTTPS proxy. A loopback URL in the cloud workspace is not a phone-accessible demo. No TURN server is configured; use the same Wi-Fi/hotspot first. Internet is needed to load the app and contact PeerJS Cloud. Gameplay is direct P2P where ICE succeeds, not truly offline.

## Play

Play Solo starts a three-second countdown without signaling. Host a Party lets you name yourself, creates a room and shows a QR/link. Friends open that link, enter a nickname, then join. The host can start with 1–8 people. Touch: left joystick + right Jump. Desktop: WASD/arrows + Space. Camera follows automatically. Landscape gives more space; portrait remains usable and displays a rotation hint.

Jump gaps, dodge rotating sweepers, time moving bumpers. Fall to respawn at your latest ordered checkpoint. Cross both checkpoints and then the gold finish gate. Everyone remains in the race until they finish or the 120-second deadline. Results include DNF progress; host can rematch. Guests leaving become DNF; host leaving ends the session. No host migration. Keep the host tab visible; backgrounding pauses authority, resuming sends full state.

## Deployment and website

The GitHub Pages deployment builds this project, copies `dist/` into `_site/party-panic/`, and adds the link to the existing AI Coding Agent Case Study blog post. Do not commit generated builds or node_modules. The app's Vite base is `/party-panic/`. Deploying elsewhere requires changing `base` in `vite.config.ts`. Ammo URLs resolve against that base and the pinned WASM files ship locally.

## Diagnostics and continuation

Open “Connection & performance” to inspect current FPS estimate, RTT, selected ICE candidate types, channel delivery settings, message counts and application bandwidth. Save diagnostics exports bounded structured event logs and distributions. It does not export candidate IP addresses. Counts exclude protocol overhead; software-rendered CI FPS is not a phone benchmark.

For fault injection run the **development** build with `?debug=1`; use the diagnostics button for 80ms ±40ms, 3% movement loss and 5% reordering. The debug window API is for invariant E2E tests only and is compiled out of production. Do not expose test builds publicly. Browser network throttling is not used to simulate WebRTC packet loss.

Continue from the task-specific Git commits, package lock, architecture and decision log. There are **no trained ML models** or GPU training in this project; no model weights/checkpoints are applicable. Original characters/course are generated from deterministic source geometry. Movement tuning lives in `simulation.ts`; layout in `scene.ts`; scoring/checkpoints in `rules.ts`. Source and tuning checkpoints, rather than learned weights, preserve the complete work.

See [architecture](docs/architecture.md), [network experiment](docs/network-spike.md), [validation](docs/validation.md), [decisions](docs/decisions.md), and Ammo provenance at `public/ammo/SOURCE.md`.
