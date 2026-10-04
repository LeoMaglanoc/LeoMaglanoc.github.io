# Architecture

Gatekeeper is a static Vite application. UI, timer, avatar, state, and ending rules run on the browser main thread. Local inference runs in a dedicated WebGPU worker in a browser, or through the Capacitor native bridge on Android; no request contains player text and there is no cloud model.

`GameEngine` depends only on the generation shape shared by `LlmBackend`. A model can propose a short reply and score deltas, but `rules.ts` clamps scores and independently decides every ending. `action` is deliberately advisory. The model output is extracted, parsed, Zod-validated, then given one compact repair attempt; failure produces a deterministic safe turn.

The browser backend is pinned Gemma 4 E2B Q4F16 through Transformers.js and WebGPU. It verifies a WebGPU adapter before loading; there is no CPU fallback. `?mock=1` selects the scripted model used by browser tests. `?debug=1` displays the platform, backend, GPU confirmation, model, quantization, load time, first-token timing, generation timing, and token rate.

Local assets live below `public/models/` and are loaded with `env.allowRemoteModels = false` and `env.allowLocalModels = true`. Transformers.js Cache API support is explicitly enabled so cached local assets can be reused. Vite uses a relative default base path, so built assets work below a subdirectory. The VRM avatar uses ordinary WebGL and therefore remains independent of the inference capability gate.

## Model selection

Previous CPU-only experiments are recorded in [`benchmarks/cpu-experiments.md`](benchmarks/cpu-experiments.md). The implementation config is centralized in `src/llm/config.ts` so UI and game logic do not change when swapping a GPU backend.
