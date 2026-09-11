export const TRANSFORMERS_VERSION = "3.8.1";

export const MODEL_CONFIG = {
  id: "onnx-community/SmolLM2-360M-Instruct-ONNX",
  label: "SmolLM2-360M-Instruct",
  dtype: "q4f16",
  device: "webgpu",
  approximateDownload: "~272 MB",
  maxNewTokens: 160,
  doSample: false,
};

// Used only when the browser has no WebGPU. This keeps the feature local and
// functional on more machines without downloading the 360M WebGPU model.
export const WASM_FALLBACK_MODEL_CONFIG = {
  id: "onnx-community/SmolLM2-135M-Instruct-ONNX",
  label: "SmolLM2-135M-Instruct",
  dtype: "q4",
  device: "wasm",
  approximateDownload: "~117 MB",
  maxNewTokens: 120,
  doSample: false,
};

export const MODEL_CANDIDATES = [
  { ...WASM_FALLBACK_MODEL_CONFIG, dtype: "q4f16", device: "webgpu" },
  MODEL_CONFIG,
  {
    id: "onnx-community/Qwen3-0.6B-ONNX",
    label: "Qwen3-0.6B",
    dtype: "q4f16",
    approximateDownload: "~570 MB",
  },
];
