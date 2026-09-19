# Feasibility result — 2026-09-19

## Native reproduction: pass

The exact upstream Track-1 invocation was run in the Docker-only reproduction image:

```bash
./run.sh track1 --n_bots 10
```

It started map 1 with one Arnold agent and ten built-in bots. In the bounded native run, the upstream log recorded movement, ammunition use, armour/health pickups, kills, death, and automatic respawn. A separate 512-decision trace, using the same ViZDoom scenario and checkpoint, recorded 17 kills, 3 deaths, 1 suicide, varied actions, pickups, and respawns.

The trace is deliberately ignored by git because it contains observations derived from assets whose redistribution status is not verified.

## Policy export and parity: pass locally, not publishable

`tools/export_arnold_onnx.py` exports a local `arnold_track1.onnx` with explicit LSTM state. On a 512-step native reference trace, ONNX Runtime CPU and PyTorch produced:

- 0 greedy-action mismatches;
- maximum absolute output/state difference ≤ `6.10351562e-05`;
- correct `q_values [1,35]`, `hidden_out [1,1,512]`, and `cell_out [1,1,512]` shapes.

On the same Docker CPU provider, the local ONNX policy measured 1.69 ms median and 1.97 ms p95 across those 512 steps, below the 85.71 ms native control-step budget. This is an exporter sanity measurement—not a browser or mobile-performance claim.

This validates conversion; it does not grant a right to publish the derivative model.

## Browser engine gate: fail

Two browser-engine candidates were evaluated before UI work:

1. `theMagicalKarp/wasmdoom` has an excellent framebuffer and input API but its own README says it is single-player only. It cannot host the Track-1 ten-bot deathmatch.
2. `UZDoom/UZDoom` has a modern Doom lineage, but the evaluated revision did not provide a released browser-WASM build or a documented JavaScript framebuffer/state/action interface. It also cannot be assumed to reproduce ViZDoom's custom scenario behavior.

Neither candidate can close the required `framebuffer + variables → Arnold → controls` loop faithfully. No browser frontend, fallback policy, scripted behaviour, mock telemetry, `/doom/` route, homepage link, or project-page claim has been shipped.

## Release decision

The work is blocked at the plan's two mandatory gates: unverified redistribution rights and no validated browser environment. The repository contains reproducible container tooling and exact policy documentation so the effort can continue once those gates clear. This is intentionally not presented as a completed web demo.
