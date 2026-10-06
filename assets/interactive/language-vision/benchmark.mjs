import { Tokenizer } from "./tokenizer.mjs";
import { rankRegions } from "./retrieval.mjs";
const $ = (id) => document.getElementById(id);
let report;
const cosine = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0) / Math.sqrt(a.reduce((s, x) => s + x * x, 0) * b.reduce((s, x) => s + x * x, 0));
const median = (a) => {
  const b = [...a].sort((x, y) => x - y);
  return (b[Math.floor((b.length - 1) / 2)] + b[Math.ceil((b.length - 1) / 2)]) / 2;
};
$("run").addEventListener("click", async () => {
  $("run").disabled = true;
  $("download").disabled = true;
  $("report").textContent = "Loading benchmark fixtures…";
  let worker;
  let request = 0,
    resolveReady,
    rejectReady;
  const pending = new Map();
  try {
    const [fixtures, tokenizerData, scenes, model] = await Promise.all(
      ["models/parity-fixtures.json", "models/tokenizer.json", "data/scenes.json", "models/model.json"].map((u) =>
        fetch(u).then((r) => {
          if (!r.ok) throw new Error("Cannot load " + u);
          return r.json();
        })
      )
    );
    const tokenizer = new Tokenizer(tokenizerData);
    const tokenizerFailures = fixtures.filter((f) => JSON.stringify(tokenizer.encode(f.query).ids) !== JSON.stringify(f.tokens)).map((f) => f.query);
    if (tokenizerFailures.length) throw new Error("Tokenizer parity failed: " + tokenizerFailures.join(", "));
    worker = new Worker(new URL("./worker.mjs", import.meta.url), { type: "module" });
    const ready = new Promise((resolve, reject) => {
      resolveReady = resolve;
      rejectReady = reject;
    });
    worker.onerror = (e) => {
      rejectReady(new Error(e.message));
      for (const p of pending.values()) p.reject(new Error(e.message));
    };
    worker.onmessage = ({ data }) => {
      if (data.type === "progress") {
        $("status").textContent = `Loading ${(data.received / 1e6).toFixed(1)} / ${(data.total / 1e6).toFixed(1)} MB`;
        $("progress").hidden = false;
        $("progress").value = data.received / data.total;
      }
      if (data.type === "initializing") {
        $("status").textContent = "Initializing WASM…";
        $("progress").hidden = true;
      }
      if (data.type === "ready") resolveReady(data);
      if (data.type === "result") {
        pending.get(data.id)?.resolve(data);
        pending.delete(data.id);
      }
      if (data.type === "error") {
        const e = new Error(data.error);
        rejectReady(e);
        pending.get(data.id)?.reject(e);
        pending.delete(data.id);
      }
    };
    const query = (text) =>
      new Promise((resolve, reject) => {
        const id = ++request;
        pending.set(id, { resolve, reject });
        worker.postMessage({ type: "query", id, query: text, includeVector: true });
      });
    worker.postMessage({ type: "init" });
    const loaded = await ready;
    $("status").textContent = "Running first query…";
    const first = await query(fixtures[0].query);
    const warm = [];
    for (let i = 0; i < 20; i++) {
      $("status").textContent = `Warm query ${i + 1} / 20…`;
      warm.push((await query(fixtures[i + 1].query)).inferenceMs);
    }
    const vectors = [],
      agreements = [];
    for (let i = 0; i < fixtures.length; i++) {
      $("status").textContent = `Embedding parity ${i + 1} / ${fixtures.length}…`;
      const r = await query(fixtures[i].query);
      vectors.push(r.vector);
      agreements.push(cosine(r.vector, fixtures[i].reference));
    }
    let top1 = 0,
      overlap = 0,
      comparisons = 0;
    for (const s of scenes) {
      const [m, buffer] = await Promise.all([
        fetch(`data/${s.id}/manifest.json`).then((r) => r.json()),
        fetch(`data/${s.id}/embeddings.bin`).then((r) => r.arrayBuffer()),
      ]);
      const e = new Float32Array(buffer);
      for (let i = 0; i < fixtures.length; i++) {
        const a = rankRegions(fixtures[i].reference, e, m, model.scoringStrategy).results,
          b = rankRegions(vectors[i], e, m, model.scoringStrategy).results;
        top1 += Number(a[0].id === b[0].id);
        overlap += a.slice(0, 3).filter((x) => b.slice(0, 3).some((y) => y.id === x.id)).length / 3;
        comparisons++;
      }
    }
    report = {
      measuredAt: new Date().toISOString(),
      device: $("device").value.trim() || "Unspecified device; see user agent",
      userAgent: navigator.userAgent,
      viewport: { width: innerWidth, height: innerHeight },
      hardwareConcurrency: navigator.hardwareConcurrency,
      deviceMemoryGB: navigator.deviceMemory ?? null,
      executionProvider: "CPU / WASM, 1 thread, Web Worker",
      model: loaded.metadata.model,
      precision: loaded.metadata.precision,
      modelBytes: loaded.modelBytes,
      downloadMs: loaded.loadMs,
      initializationMs: loaded.initMs,
      firstInferenceMs: first.inferenceMs,
      warmQueries: 20,
      medianWarmMs: median(warm),
      p95WarmMs: [...warm].sort((a, b) => a - b)[Math.ceil(warm.length * 0.95) - 1],
      warmLatenciesMs: warm,
      tokenizerParity: { passed: fixtures.length, total: fixtures.length },
      embeddingParity: {
        queries: fixtures.length,
        meanCosine: agreements.reduce((s, x) => s + x, 0) / agreements.length,
        minCosine: Math.min(...agreements),
      },
      retrievalParity: { comparisons, top1Agreement: top1 / comparisons, top3Overlap: overlap / comparisons },
      peakMemory: null,
      memoryNote: "No reliable worker peak-memory measurement exposed by this browser.",
    };
    $("report").textContent = JSON.stringify(report, null, 2);
    $("status").textContent = "Complete. These numbers describe this browser and this device.";
    $("download").disabled = false;
  } catch (e) {
    $("status").textContent = "Benchmark failed: " + e.message;
    $("report").textContent = String(e);
  } finally {
    worker?.terminate();
    $("run").disabled = false;
    $("progress").hidden = true;
  }
});
$("download").addEventListener("click", () => {
  if (!report) return;
  const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2) + "\n"], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "language-vision-benchmark.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
