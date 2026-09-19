# Third-party notices

For this MVP, `plan.md` directs the project to assume permission to convert and serve the publicly available Arnold Track-1 checkpoint. The pinned Arnold tree still contains no explicit licence grant; this notice preserves that fact and attribution rather than treating it as a release blocker.

| Component | Revision / artifact | License or status | Repository action |
| --- | --- | --- | --- |
| [Arnold — DOOM Agent](https://github.com/glample/Arnold) | `86af06d2fdb35c4bf552ecacfe8fe6ac1abd8cd4` | No `LICENSE`, `COPYING`, or explicit licence grant in the pinned tree | Attribution and provenance retained; used under the MVP assumption in `plan.md` |
| Arnold Track-1 checkpoint | `pretrained/vizdoom_2017_track1.pth`; SHA-256 `08a59e88fb7c69d27f8326f7b724b6ef876758aa74e4d71686db637d37c8d36f` | No explicit redistribution grant found with Arnold | Converted to the browser ONNX artifact under that MVP assumption |
| Arnold bundled Freedoom IWAD | `resources/freedoom2.wad`; SHA-256 `113ea2d9677074f54cbde29b8f739629f438ed20e3b1d3ba69c9478318ea504d` | The pinned Arnold tree does not identify the upstream release or provide its licence text | Not copied or deployed pending provenance verification |
| Track-1 scenario | `resources/scenarios/deathmatch_rockets.wad`; SHA-256 `3487f58ceacf3a5b1ae527c39867048ad28464c938b2b7c747501b055b66fa88` | The pinned Arnold tree provides no licence/provenance for this artifact | Not copied or deployed pending provenance verification |
| [ViZDoom](https://github.com/Farama-Foundation/ViZDoom) | Python package `1.2.4` in the local reproduction container | MIT (upstream source) | Tool-only dependency; no ViZDoom binary is served |
| [ONNX Runtime](https://github.com/microsoft/onnxruntime) | Python `1.20.1`; Web `1.21.0` | MIT | Python tooling plus local browser WASM runtime |
| [tomb-engine](https://github.com/mungus43/tomb-engine) | `6c735315b8ac1b1dd6646ac78c46bbbdbb775a5c` | GPL-3.0; GZDoom browser port | Pinned as `vendor/tomb-engine`; unmodified runtime bundle and a documented local bridge prototype |
| FreeDM | tomb-engine `demo/freedm.wad` | Modified BSD, per tomb-engine’s bundled notice | Browser IWAD used by the prototype |
| [wasmdoom](https://github.com/theMagicalKarp/wasmdoom) | evaluated `dd321b50b89b5085698cfbf2ff01b2f741da8206` | GPL-2.0; its README explicitly states the port is single-player only | Rejected: cannot run the Track-1 deathmatch/bot scenario |
| [UZDoom](https://github.com/UZDoom/UZDoom) | evaluated `1dd5eb18f6aa08b0f9e017144ad418b5b4071d4d` | GPL-3.0 with documented asset exceptions | Rejected: the project had no released/documented browser-WASM integration or ViZDoom-compatible framebuffer/state API at evaluation time |

## Current technical release condition

The model permission assumption is not the blocker. The browser integration now avoids the failed network-host and ZScript-mod paths: it uses GZDoom's local Cajun bot machinery and a small C++ Emscripten bridge. The bridge source patch is included under `engine/patches/`; Tomb's documented WebGL/JSPI source patch series is not present in its public checkout, so no patched browser binary is represented as ready. Therefore this repository does not add the public `/doom/` route or homepage card yet. If the GZDoom runtime is rebuilt, GPLv3 source/distribution obligations for the port must be preserved.
