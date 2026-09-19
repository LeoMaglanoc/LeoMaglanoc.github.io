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

The prototype is deliberately not linked at `/doom/` yet. Docker Playwright demonstrated that unmodded FreeDM runs and the ONNX/action loop sustains 11.67 Hz, but the pinned Tomb JSPI build aborts if a `-file` ZScript state bridge is mounted or the multiplayer host count is raised beyond its stable one-player configuration. That prevents a truthful Arnold-versus-ten-bot claim. Full evidence is in [docs/FEASIBILITY.md](docs/FEASIBILITY.md).

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
