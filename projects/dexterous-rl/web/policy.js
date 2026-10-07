export async function loadPolicy() {
  const ort = await import("../language-vision/vendor/ort.wasm.min.mjs");
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.proxy = false;
  ort.env.wasm.wasmPaths = {
    mjs: new URL("../language-vision/vendor/ort-wasm-simd-threaded.mjs", import.meta.url).href,
    wasm: new URL("../euroguessr/vendor/ort-wasm-simd-threaded.wasm", import.meta.url).href,
  };
  const session = await ort.InferenceSession.create(new URL("./policy.onnx", import.meta.url).href, {
    executionProviders: ["wasm"],
    graphOptimizationLevel: "all",
  });
  return async (observation) => {
    const result = await session.run({ [session.inputNames[0]]: new ort.Tensor("float32", observation, [1, 207]) });
    return Float32Array.from(result[session.outputNames[0]].data);
  };
}
