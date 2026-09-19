# Native browser bridge build

This directory contains the smallest source-level change required for the
browser MVP. `patches/0001-browser-rl-bridge.patch` applies cleanly to public
GZDoom `g4.11.3` (`6ce809efe2902e43ceaa7031b875225d3a0367de`). It exports:

- `doom_is_level_ready`, `doom_spawn_bots`, and `doom_bot_count`;
- `doom_get_health`, `doom_get_selected_ammo`, and `doom_get_frags`;
- `doom_reset_match`.

`doom_spawn_bots` calls `FCajunMaster::SpawnBot`, the same Cajun-bot path used
by `addbot`. It does not add `-host` or create a browser UDP session. Health is
the console player's live pawn health; selected ammo is the ready weapon's
`Ammo1.Amount`, matching ViZDoom's `HEALTH` and `SELECTED_WEAPON_AMMO` inputs.
There is intentionally no `doom_get_deaths`: GZDoom 4.11.3 does not keep a
single console-player death counter with the required semantics, and the MVP
does not need it for policy input.

Run the builder only through Docker:

```bash
docker build -f assets/interactive/doom/engine/build/Dockerfile \
  -t ai-doom-engine-builder .
docker run --rm -v "$PWD:/workspace" \
  -e TOMB_GZDOOM_SOURCE_DIR=/workspace/path/to/tomb-gzdoom-fork \
  ai-doom-engine-builder
```

The public Tomb-engine checkout is pinned for attribution, but it supplies a
patch inventory rather than its actual GZDoom WebGL/JSPI source. The builder
therefore requires a checkout of that compatible fork and stops before
compilation when it is absent. This is deliberate: an upstream native GZDoom
build must not be labelled as a compatible replacement for Tomb's browser
engine. It builds host parser tools, then uses `emcmake` and retains
`-sJSPI=1`. The sole custom patch is the bridge above. No Asyncify variant has
been introduced or tested. Successful output is staged in `engine/custom/`
(`gzdoom.js`, `gzdoom.wasm`, and the matching worker); that generated directory
is intentionally ignored and is the only engine binary the browser app loads.
