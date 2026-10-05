/* Coordinates and round IDs are never sent to this worker. */
importScripts("../vendor/ort.min.js");
let session, metadata, references, predict;
async function json(url) {
  const response = await fetch(url);
  if (!response.ok) throw Error(`Could not load ${url}: ${response.status}`);
  return response.json();
}
onmessage = async ({ data }) => {
  try {
    if (data.type === "init") {
      ort.env.wasm.numThreads = 1;
      ort.env.wasm.proxy = false;
      ort.env.wasm.wasmPaths = new URL("../vendor/", self.location.href).href;
      const mod = await import("./geo.js");
      predict = mod.selectPrediction;
      metadata = await json("../models/metadata.json");
      references = metadata.method === "head" ? null : await json("../models/references.json");
      if (references?.feature_file) {
        const response = await fetch(new URL(`../models/${references.feature_file}`, self.location.href));
        if (!response.ok) throw Error("Could not load visual references");
        const buffer = await response.arrayBuffer();
        if (buffer.byteLength !== references.count * references.dimensions * 4) throw Error("Invalid visual reference file");
        references.features = Array.from(
          { length: references.count },
          (_, i) => new Float32Array(buffer, i * references.dimensions * 4, references.dimensions)
        );
      }
      session = await ort.InferenceSession.create(new URL("../models/model.onnx", self.location.href).href, { executionProviders: ["wasm"] });
      postMessage({ type: "ready", metadata });
    } else if (data.type === "predict") {
      if (!session) throw Error("AI is not initialized");
      const start = performance.now();
      const input = new ort.Tensor("float32", data.pixels, [1, 3, 224, 224]);
      const out = await session.run({ image: input });
      const location = predict(Array.from(out.embedding.data), Array.from(out.logits.data), metadata, references);
      if (!Number.isFinite(location.lat) || !Number.isFinite(location.lon)) throw Error("AI produced an invalid coordinate");
      input.dispose();
      Object.values(out).forEach((t) => t.dispose());
      postMessage({ type: "prediction", token: data.token, location, milliseconds: performance.now() - start });
    }
  } catch (error) {
    postMessage({ type: "error", message: error.message, token: data.token });
  }
};
