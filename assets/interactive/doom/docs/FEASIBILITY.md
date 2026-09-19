# Feasibility result — 2026-09-19

## Native reproduction: pass

The exact upstream Track-1 invocation was run in the Docker-only reproduction image:

```bash
./run.sh track1 --n_bots 10
```

It started map 1 with one Arnold agent and ten built-in bots. In the bounded native run, the upstream log recorded movement, ammunition use, armour/health pickups, kills, death, and automatic respawn. A separate 512-decision trace, using the same ViZDoom scenario and checkpoint, recorded 17 kills, 3 deaths, 1 suicide, varied actions, pickups, and respawns.

The trace is deliberately ignored by git because it contains observations derived from assets whose redistribution status is not verified.

## Policy export and parity: pass

`tools/export_arnold_onnx.py` exports a local `arnold_track1.onnx` with explicit LSTM state. On a 512-step native reference trace, ONNX Runtime CPU and PyTorch produced:

- 0 greedy-action mismatches;
- maximum absolute output/state difference ≤ `6.10351562e-05`;
- correct `q_values [1,35]`, `hidden_out [1,1,512]`, and `cell_out [1,1,512]` shapes.

On the same Docker CPU provider, the local ONNX policy measured 1.69 ms median and 1.97 ms p95 across those 512 steps, below the 85.71 ms native control-step budget. This is an exporter sanity measurement—not a browser or mobile-performance claim.

Per the current project plan, this MVP proceeds under an explicit assumption that use and conversion of the public checkpoint are permitted. The upstream tree still has no explicit licence; see the notice.

## Browser engine gate: corrected architecture, pending custom binary

`mungus43/tomb-engine` at `6c735315b8ac1b1dd6646ac78c46bbbdbb775a5c` is pinned under `vendor/`; its FreeDM/GZDoom Worker bundle is mounted in the prototype. Docker Playwright previously verified unmodified FreeDM rendering, local ONNX execution at the required 11.67 Hz cadence, and keyboard action injection.

The prior failure was specific to two unnecessary paths: `-host 11` aborted under JSPI, and loading `-file bridge.pk3` aborted under JSPI. Those are not evidence that a local ten-bot match is infeasible. GZDoom's `addbot` command calls `FCajunMaster::SpawnBot`, which allocates local `players[]` slots and creates `DBot` instances. The revised launch has no `-host` and no mod. It starts a local FreeDM deathmatch, waits for `GS_LEVEL`, and uses a small Emscripten bridge to schedule those local bots.

The bridge patch is [engine/patches/0001-browser-rl-bridge.patch](../engine/patches/0001-browser-rl-bridge.patch). It exports local bot spawn/count, live console-player health, ready-weapon `Ammo1.Amount`, frags, level readiness, and reset. The worker reads only the exported values and canvas RGB; it neither reads the HUD nor includes a ZScript event handler.

The patch applies cleanly to public GZDoom `g4.11.3` (`6ce809efe2902e43ceaa7031b875225d3a0367de`). However, Tomb's public checkout contains its WebGL/JSPI patch inventory, not its source patch series. [engine/build](../engine/BUILD.md) has a Docker-only builder that applies this small patch first and refuses to build a falsely-labelled Tomb replacement until that upstream series is supplied. JSPI remains the only configured strategy; Asyncify has not been introduced.

Therefore the direct-engine browser tests are intentionally still pending, rather than marked pass without the binary they require:

1. FreeDM local deathmatch with one local bot.
2. The same match with ten local bots, stable for several minutes.
3. Repeated direct health/ammo reads through damage, pickups, firing, and respawn.
4. Arnold at exactly about 11.67 Hz using RGB + health + ammo.
5. Arnold versus ten bots with kills, deaths, action diversity, stuck time, FPS, inference median/p95, and effective policy rate.

Only after those passes will the `/doom/` route, homepage link, and real Android test be claimed as released. No fallback policy or retraining has been used.
