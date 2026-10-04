# Browser Doom Deathmatch

A browser-native Doom deathmatch built on GZDoom/WebAssembly. The game runs
entirely client-side: FreeDM plus the original `deathmatch_rockets.wad` map,
one human player, and local GZDoom bots. It does not use network multiplayer.

Open `/doom/` on the site, or serve the repository locally and visit
`/assets/interactive/doom/`. Click **START MATCH** to unlock audio and load the
engine. Desktop defaults to 10 local bots; touch layouts default to 4 to leave
headroom for mobile controls.

Controls:

- Desktop: WASD, mouse aim, left-click fire, E/Space use, 1–6 weapons, Esc to release the mouse.
- Touch: use landscape mode; the left joystick moves, the right half aims, and the buttons fire, use, and cycle weapons.

`RESET MATCH` deliberately creates a fresh worker and map, so it clears the
match state and bot roster without requiring a page reload. `MUTE` is preserved
across resets.

## Runtime contents

The runtime uses the pinned Tomb-engine bundle at
`6c735315b8ac1b1dd6646ac78c46bbbdbb775a5c`, its GZDoom WASM worker, and the
included `game/deathmatch_rockets.wad` (`SHA-256`
`3487f58ceacf3a5b1ae527c39867048ad28464c938b2b7c747501b055b66fa88`).
`MAP01` is the map used by the upstream Track-1 native reproduction.

## Archived AI policy experiments

This repository also retains experimental Arnold/ViZDoom policy export and
validation work under `research/` and the adjacent research-only directories.
That material is not loaded, imported, or required by the released browser
game. See [research/README.md](research/README.md).

## Testing notes

The browser implementation targets current Chromium-family browsers with
OffscreenCanvas support. Playwright/browser checks cover the start flow,
rendering, controls, reset, and touch layout. A real Android Chrome soak test
is still a release follow-up; no iOS support is claimed.

See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for attribution and asset
provenance.
