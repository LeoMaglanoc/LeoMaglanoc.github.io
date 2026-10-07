import * as ort from "./vendor/ort.wasm.min.mjs";
import { Tokenizer } from "./tokenizer.mjs";
import { normalize, rankRegions } from "./retrieval.mjs";
let session,
  tokenizer,
  metadata,
  latestQueryId = 0;
async function checked(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Cannot load ${url} (${r.status})`);
  return r;
}
async function initialize(config = {}) {
  const started = performance.now();
  metadata = await (await checked(config.metadataURL || "./models/model.json")).json();
  tokenizer = new Tokenizer(await (await checked("./models/tokenizer.json")).json());
  const response = await checked(config.modelURL || "./models/text-int8.onnx");
  const total = Number(response.headers.get("Content-Length")) || metadata.modelBytes;
  const reader = response.body.getReader(),
    chunks = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    postMessage({ type: "progress", received, total });
  }
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.length;
  }
  chunks.length = 0;
  const downloaded = performance.now();
  postMessage({ type: "initializing" });
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.wasmPaths = {
    mjs: new URL("./vendor/ort-wasm-simd-threaded.mjs", import.meta.url).href,
    wasm: new URL("../euroguessr/vendor/ort-wasm-simd-threaded.wasm", import.meta.url).href,
  };
  session = await ort.InferenceSession.create(bytes, { executionProviders: ["wasm"], graphOptimizationLevel: "all" });
  postMessage({ type: "ready", metadata, loadMs: downloaded - started, initMs: performance.now() - downloaded, modelBytes: received });
}
async function handle(message) {
  const { id, type } = message;
  if (type === "query" && id !== latestQueryId) return;
  try {
    if (type === "init") {
      await initialize(message);
      return;
    }
    if (!session) throw new Error("The text model has not loaded.");
    const start = performance.now();
    const { ids, truncated } = tokenizer.encode(message.query);
    const tensor = new ort.Tensor("int64", BigInt64Array.from(ids, BigInt), [1, metadata.contextLength]);
    const encoded = await session.run({ [metadata.input]: tensor });
    const vector = normalize(encoded[metadata.output].data);
    const inferenceMs = performance.now() - start;
    const ranked = message.embeddings ? rankRegions(vector, message.embeddings, message.manifest, metadata.scoringStrategy) : {};
    postMessage({
      type: "result",
      id,
      query: message.query,
      inferenceMs,
      totalMs: performance.now() - start,
      truncated,
      vector: message.includeVector ? vector : undefined,
      ...ranked,
    });
  } catch (error) {
    postMessage({ type: "error", id, error: error.message });
  }
}
let queue = Promise.resolve();
onmessage = ({ data }) => {
  if (data.type === "query") latestQueryId = data.id;
  queue = queue.then(() => handle(data));
};
