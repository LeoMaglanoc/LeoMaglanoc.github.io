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

## Browser engine gate: evaluated, not passed

`mungus43/tomb-engine` at `6c735315b8ac1b1dd6646ac78c46bbbdbb775a5c` is now pinned under `vendor/` and its FreeDM/GZDoom Web Worker bundle is mounted in the browser prototype. A Docker Playwright run verified unmodded FreeDM rendering, local ONNX execution at the required 11.67 Hz cadence, and the concrete action transport.

The closed loop has not passed. The GZDoom browser build reports `player 1 of 1` when launched with the stable `-host 1` configuration. Raising the host count to 11 causes a JSPI `trying to suspend JS frames` abort. Mounting the minimal ZScript bridge with `-file bridge.pk3` also causes the same abort, so exact health/ammo cannot currently be exported without modifying the engine build. These are runtime failures, not a licence decision.

The app contains the engine adapter, RGB readback, exact ONNX/LSTM/action implementation, desktop/touch controls, and UI state machine as an integration prototype. It is not linked from the website because declaring Arnold-vs-ten-bots working would be false.

## Release decision

The remaining blocker is browser engine compatibility: a stable GZDoom browser build must support both an 11-player/bot match and a minimal state bridge. No fallback policy was substituted and no retraining was performed.
