# Gatekeeper

A local-first game: persuade Rurik the city guard before curfew catches you. There is no backend or cloud inference. The browser uses WebGPU only; the Android Capacitor app uses llama.cpp with Vulkan only.

## Development

```sh
git clone --recurse-submodules git@github.com:LeoMaglanoc/LeoMaglanoc.github.io.git
cd LeoMaglanoc.github.io/projects/llm-city-guard
npm ci
npm run dev
```

For a checkout made without submodules:

```sh
git submodule update --init --recursive
```

The browser production backend requires the pinned local Gemma 4 E2B ONNX Q4F16 assets. It verifies a WebGPU adapter before any model load and has no CPU fallback. `?mock=1` starts the entirely local scripted backend used for UI development and CI; `/debug amused` (and the other five emotions) makes avatar states deterministic. `?debug=1` exposes runtime diagnostics.

The model is intentionally not committed. See [docs/architecture.md](docs/architecture.md), [docs/dependencies.md](docs/dependencies.md), and [docs/benchmarks/cpu-experiments.md](docs/benchmarks/cpu-experiments.md) before claiming a release build. Run `npm test`, `npm run test:e2e`, `npm run test:model`, and `npm run build` as applicable.

## Docker

The web-side development environment is reproducible with Docker:

```sh
docker compose build
docker compose up
docker compose run --rm app npm test
docker compose run --rm app npm run test:e2e
docker compose run --rm app npm run build
```

The Docker build intentionally excludes multi-GB local model files. Real browser inference is tested on a WebGPU-capable host; CI and UI checks use `?mock=1`.

## Android

`android/` is a Capacitor wrapper over this same frontend. It never performs inference in the WebView. The native bridge requires a documented Gemma 4 E2B Q4 GGUF at `models/gemma-4-E2B-Q4_K_M.gguf` in the app external-files directory, then:

```sh
npm run android:sync
npm run android:build
npm run android:install
GATEKEEPER_GGUF=/absolute/path/to/gemma-4-E2B-Q4_K_M.gguf npm run test:phone
```

The device command refuses to pass when it cannot find exactly one adb device, an identified model, or Vulkan diagnostics. Toolchain pins and native dependency details are in [docs/dependencies.md](docs/dependencies.md).

For a user-authorized direct phone download of the verified community Q4_K_M acceptance artifact, launch the installed app with `https://localhost/?downloadModel=1&deviceTest=1`. The model is downloaded into the app's Android external-files directory, not the laptop, and verified before loading.
