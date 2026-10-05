import { Worker } from "node:worker_threads";
import assert from "node:assert/strict";
const worker = new Worker(new URL("./worker-node-bridge.mjs", import.meta.url));
const messages = [];
let stage = "init";
const timeout = setTimeout(() => {
  worker.terminate();
  throw new Error("Worker test timed out");
}, 15000);
await new Promise((resolve, reject) => {
  worker.on("error", reject);
  worker.on("message", async (data) => {
    try {
      messages.push(data);
      if (data.type === "error") throw new Error(data.message);
      if (stage === "init" && data.type === "ready") {
        stage = "play";
        worker.postMessage({ type: "play", id: 2, action: data.state.legal[0].action });
      } else if (stage === "play" && data.type === "state") {
        stage = "search";
        worker.postMessage({ type: "search", id: 3, simulations: 1024 });
      } else if (stage === "search" && data.type === "search") {
        stage = "back";
        worker.postMessage({ type: "back", id: 4, human: 0 });
      } else if (stage === "back" && data.type === "history") {
        assert.equal(data.state.ply, 0);
        assert.equal(data.state.total_plies, 1);
        assert.equal(data.state.board.filter((x) => x === 1).length, 12);
        stage = "waiting";
        setTimeout(() => {
          try {
            assert.ok(!messages.some((m) => m.type === "complete" && m.id === 3), "Cancelled search must not commit a move");
            resolve();
          } catch (e) {
            reject(e);
          }
        }, 350);
      }
    } catch (error) {
      reject(error);
    }
  });
  worker.postMessage({ type: "init", id: 1, checkpoint: "final", local: false });
});
clearTimeout(timeout);
await worker.terminate();
console.log(JSON.stringify({ actualWorkerCancellation: "PASS", abandonedSearchDidNotPlay: "PASS" }));
