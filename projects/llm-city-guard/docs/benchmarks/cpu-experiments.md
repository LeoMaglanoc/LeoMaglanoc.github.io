# Rejected CPU inference experiments

This record preserves the pre-GPU feasibility work. It is historical evidence,
not a production benchmark or fallback path.

| Date | Candidate | Backend | Result |
| --- | --- | --- | --- |
| 2026-09-14 | Gemma 4 E2B Q4 | ONNX Runtime WASM / CPU | Did not become ready after 7:00 under the observed workload. |
| 2026-09-14 | Qwen3 0.6B Q4 | ONNX Runtime WASM / CPU | Did not become ready after 4:18. |
| 2026-09-14 | SmolLM2 360M Q4 | ONNX Runtime WASM / CPU | Did not become ready after 4:36. |

Gatekeeper production inference is GPU-only: WebGPU in a browser and Vulkan via
llama.cpp on Android. CPU inference is deliberately unsupported.
