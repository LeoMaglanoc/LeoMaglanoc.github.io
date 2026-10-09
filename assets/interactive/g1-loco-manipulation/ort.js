export * from "../language-vision/vendor/ort.wasm.min.mjs";
import * as ort from "../language-vision/vendor/ort.wasm.min.mjs";
ort.env.wasm.numThreads = 1;
ort.env.wasm.proxy = false;
ort.env.wasm.wasmPaths = {
  mjs: new URL("../language-vision/vendor/ort-wasm-simd-threaded.mjs", import.meta.url).href,
  wasm: new URL("../euroguessr/vendor/ort-wasm-simd-threaded.wasm", import.meta.url).href,
};
