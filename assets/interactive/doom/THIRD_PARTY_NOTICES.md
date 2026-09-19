# Third-party notices and redistribution gate

This directory intentionally contains no Arnold source, checkpoint, WAD, converted ONNX model, or browser Doom engine. The first gate in `plan.md` has **not** cleared for public deployment.

| Component | Revision / artifact | License or status | Repository action |
| --- | --- | --- | --- |
| [Arnold — DOOM Agent](https://github.com/glample/Arnold) | `86af06d2fdb35c4bf552ecacfe8fe6ac1abd8cd4` | No `LICENSE`, `COPYING`, or explicit licence grant in the pinned tree | Local Docker image only; not vendored, committed, served, or deployed |
| Arnold Track-1 checkpoint | `pretrained/vizdoom_2017_track1.pth`; SHA-256 `08a59e88fb7c69d27f8326f7b724b6ef876758aa74e4d71686db637d37c8d36f` | No explicit redistribution grant found with Arnold | Local Docker image only; derived ONNX is also not redistributed |
| Arnold bundled Freedoom IWAD | `resources/freedoom2.wad`; SHA-256 `113ea2d9677074f54cbde29b8f739629f438ed20e3b1d3ba69c9478318ea504d` | The pinned Arnold tree does not identify the upstream release or provide its licence text | Not copied or deployed pending provenance verification |
| Track-1 scenario | `resources/scenarios/deathmatch_rockets.wad`; SHA-256 `3487f58ceacf3a5b1ae527c39867048ad28464c938b2b7c747501b055b66fa88` | The pinned Arnold tree provides no licence/provenance for this artifact | Not copied or deployed pending provenance verification |
| [ViZDoom](https://github.com/Farama-Foundation/ViZDoom) | Python package `1.2.4` in the local reproduction container | MIT (upstream source) | Tool-only dependency; no ViZDoom binary is served |
| [ONNX Runtime](https://github.com/microsoft/onnxruntime) | Python package `1.20.1`; Web package not selected | MIT | Tool-only dependency; no browser build is served |
| [wasmdoom](https://github.com/theMagicalKarp/wasmdoom) | evaluated `dd321b50b89b5085698cfbf2ff01b2f741da8206` | GPL-2.0; its README explicitly states the port is single-player only | Rejected: cannot run the Track-1 deathmatch/bot scenario |
| [UZDoom](https://github.com/UZDoom/UZDoom) | evaluated `1dd5eb18f6aa08b0f9e017144ad418b5b4071d4d` | GPL-3.0 with documented asset exceptions | Rejected: the project had no released/documented browser-WASM integration or ViZDoom-compatible framebuffer/state API at evaluation time |

## Required before a website release

1. Obtain an explicit grant or licence from Arnold rightsholders covering source, checkpoint conversion and redistribution, and the Track-1 WAD.
2. Establish the original Freedoom release and licence corresponding to the bundled hash, or replace it only after verifying a faithful environment and its redistribution terms.
3. Select a browser engine that passes the closed-loop native-policy test. The two evaluated candidates above fail the functional requirements; no engine is currently selected.
4. If a GPL engine is selected, publish the corresponding source and satisfy its distribution obligations before serving the built artifact.

Until all four are complete, a `/doom/` page or homepage link would be a misleading deployment and is deliberately absent.
