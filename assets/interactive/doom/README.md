# AI Doom — Arnold browser integration

This directory reproduces Arnold Track-1 in Docker and contains a browser-native GZDoom/FreeDM integration prototype. It uses the public checkpoint under the MVP permission assumption in `plan.md`; Arnold has no explicit upstream licence, which is recorded in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

The native policy work is complete: exact Track-1 versus ten ViZDoom bots, 512-step PyTorch/ONNX validation (zero greedy mismatches; max error `6.10351562e-05`), and local CPU p95 `1.97 ms` inference.

## Browser prototype

`index.html` contains the real adapter path:

```text
GZDoom Worker / OffscreenCanvas → RGB readback → 108×60 area resize
    → Arnold ONNX + explicit LSTM state → exact 35-action mapping → GZDoom keys
```

It includes AI-first control, human takeover/return, reset, desktop pointer lock, landscape touch movement/aim/fire, and live action-score/performance UI. Tomb-engine and FreeDM are pinned/attributed locally.

The prototype is deliberately not linked at `/doom/` yet. The old `-host 11` and `-file bridge.pk3` experiments took the wrong integration path: browser hosting is not needed for GZDoom's local Cajun bots, and Arnold's two scalar inputs do not need a ZScript mod. The app now launches a single local deathmatch and asks a tiny native WASM bridge to call the same bot machinery as `addbot` and read the console player's live health/ammo. The direct patch is in [engine/patches](engine/patches/0001-browser-rl-bridge.patch).

The pinned Tomb checkout documents, but does not publish, the WebGL/JSPI patch series used to create its bundle. Consequently a compatible custom binary cannot yet be reproduced from public sources, and Tests A–E have not been claimed as passing. The Docker build intentionally stops until that patch series is supplied; details and the exact next verification order are in [docs/FEASIBILITY.md](docs/FEASIBILITY.md).

## Docker-only workflow

```bash
make build
make inspect
make native
make export
make validate
make benchmark
make test
docker compose up doom-site
```

The browser prototype is served at `http://localhost:8000/assets/interactive/doom/`. It requires a current Chromium-family browser with OffscreenCanvas and WebAssembly JSPI support.

No training, fine-tuning, scripted fallback, or mock telemetry is used.
