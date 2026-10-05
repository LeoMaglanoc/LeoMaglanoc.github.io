import { Worker } from "node:worker_threads";
import assert from "node:assert/strict";
const rows = [];
for (const simulations of [64, 256, 512, 1024]) {
  const worker = new Worker(new URL("./worker-node-bridge.mjs", import.meta.url));
  const row = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Benchmark timed out")), 30000);
    worker.on("error", reject);
    worker.on("message", (data) => {
      if (data.type === "error") reject(new Error(data.message));
      if (data.type === "ready") worker.postMessage({ type: "search", id: 2, simulations });
      if (data.type === "complete") {
        clearTimeout(timeout);
        assert.equal(
          data.stats.reduce((n, s) => n + s.visits, 0),
          simulations
        );
        assert.equal(data.state.ply, 1);
        resolve({ simulations, moveMs: data.moveMs, value: data.value });
      }
    });
    worker.postMessage({ type: "init", id: 1, checkpoint: "final" });
  });
  rows.push(row);
  await worker.terminate();
}
console.log(JSON.stringify(rows, null, 2));
