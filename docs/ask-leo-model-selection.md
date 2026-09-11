# Ask Leo model selection

## Shipped default

`onnx-community/SmolLM2-360M-Instruct-ONNX`, `q4f16`, via Transformers.js `3.8.1` and WebGPU.

This is a deliberately conservative implementation default: the model is loaded only after the section is near the viewport (unless Data Saver is enabled), inference runs in a module Worker, and the model never receives the complete knowledge base unless retrieval selects it. It is not a server-side model or API integration. When WebGPU is unavailable, Ask Leo instead loads SmolLM2-135M `q4` through local WASM after an explicit question; it does not send the question to a server.

## Candidate matrix

| Candidate | Quantization | Approx. first download | Decision |
| --- | --- | ---: | --- |
| SmolLM2-135M-Instruct | q4f16 | ~117 MB | Retained as the future constrained-device candidate; not selected before grounded-answer quality is demonstrated. |
| SmolLM2-360M-Instruct | q4f16 | ~272 MB | Selected default: middle ground between payload and expected instruction following. |
| Qwen3-0.6B | q4f16 | ~570 MB | Not selected by default; it must show a material factuality or synthesis gain on the same suite before the extra download is justified. |

## Required release benchmark

The repository includes `tests/ask-leo/questions.json` (42 factual, synthesis, skill, follow-up, unknown, privacy, and off-topic questions) and a deterministic retrieval runner. The generation comparison is intentionally not fabricated here: it requires WebGPU-capable browser hardware and downloads roughly one gigabyte across the three candidate models.

Before changing the selected model or declaring the comparison complete, run each candidate against the identical retrieved context and record the browser, GPU, model-load result, warm first-token latency, tokens/sec, grounded-answer count, fabricated-claim count, unknown refusals, and subjective synthesis quality in `tests/ask-leo/model-comparison.md`.

Acceptance gate: zero obvious fabricated professional facts on the curated suite. If no small model meets it, retain retrieval/source chips and use deterministic, semi-templated answers rather than shipping hallucinated prose.
