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

// Check the real Worker against direct network inference throughout a full game.
const { readFileSync } = await import("node:fs");
const { default: init, Game } = await import("../web/pkg/rustzero.js");
await init({ module_or_path: readFileSync(new URL("../web/pkg/rustzero_bg.wasm", import.meta.url)) });
const reference = new Game(readFileSync(new URL("../web/models/final.json", import.meta.url), "utf8"));
const policyWorker = new Worker(new URL("./worker-node-bridge.mjs", import.meta.url));
let policyPlies = 0;
try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Policy-only game timed out")), 15000);
    const fail = (error) => {
      clearTimeout(timer);
      reject(error);
    };
    policyWorker.on("error", fail);
    policyWorker.on("message", (data) => {
      try {
        if (data.type === "error") throw new Error(data.message);
        assert.notEqual(data.type, "search", "No MCTS must not stream search simulations");
        if (data.type === "complete") {
          const root = JSON.parse(reference.state());
          const { policy, value } = JSON.parse(reference.inference());
          const best = root.legal.reduce((a, b) => (policy[b.action] > policy[a.action] ? b : a));
          assert.equal(data.policyOnly, true);
          assert.equal(data.action, best.action);
          assert.equal(data.value, value);
          assert.equal(data.stats.length, root.legal.length);
          assert.ok(data.stats.every((s) => s.visits === 0 && s.probability >= 0));
          assert.ok(Math.abs(data.stats.reduce((sum, s) => sum + s.probability, 0) - 1) < 1e-10);
          reference.play(data.action);
          assert.deepEqual(data.state, JSON.parse(reference.state()));
          assert.ok(++policyPlies < 200);
          if (data.state.terminal !== null) {
            clearTimeout(timer);
            resolve();
            return;
          }
        }
        policyWorker.postMessage({ type: "search", id: policyPlies + 2, simulations: 0, policyOnly: true });
      } catch (error) {
        fail(error);
      }
    });
    policyWorker.postMessage({ type: "init", id: 1, checkpoint: "final", local: false });
  });
} finally {
  await policyWorker.terminate();
}
console.log(JSON.stringify({ policyOnlyMovesMatchNetwork: "PASS", zeroSearchVisits: "PASS", completePolicyOnlyGamePlies: policyPlies }));

// Independent successor oracle: play/undo each candidate and evaluate its value.
reference.reset();
const valueWorker = new Worker(new URL("./worker-node-bridge.mjs", import.meta.url));
let valuePlies = 0;
try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Value-lookahead game timed out")), 15000);
    const fail = (error) => {
      clearTimeout(timer);
      reject(error);
    };
    valueWorker.on("error", fail);
    valueWorker.on("message", (data) => {
      try {
        if (data.type === "error") throw new Error(data.message);
        assert.notEqual(data.type, "search", "Value lookahead must not run MCTS simulations");
        if (data.type === "complete") {
          const root = JSON.parse(reference.state());
          const candidates = root.legal.map(({ action }) => {
            reference.play(action);
            const terminal = JSON.parse(reference.state()).terminal;
            const q_value = -(terminal ?? JSON.parse(reference.inference()).value);
            reference.back(-1);
            return { action, q_value, terminal: terminal !== null };
          });
          const best = candidates.reduce((a, b) => {
            const aw = a.terminal && a.q_value === 1,
              bw = b.terminal && b.q_value === 1;
            return bw !== aw ? (bw ? b : a) : b.q_value > a.q_value ? b : a;
          });
          assert.equal(data.valueOnly, true);
          assert.equal(data.action, best.action);
          assert.ok(Math.abs(data.value - best.q_value) < 1e-6);
          assert.equal(data.stats.length, candidates.length);
          data.stats.forEach((actual, i) => {
            assert.equal(actual.action, candidates[i].action);
            assert.equal(actual.terminal, candidates[i].terminal);
            assert.ok(Math.abs(actual.q_value - candidates[i].q_value) < 1e-6);
          });
          assert.equal(data.evaluations, candidates.filter((s) => !s.terminal).length);
          reference.play(data.action);
          assert.deepEqual(data.state, JSON.parse(reference.state()));
          assert.ok(++valuePlies < 200);
          if (data.state.terminal !== null) {
            clearTimeout(timer);
            resolve();
            return;
          }
        }
        valueWorker.postMessage({ type: "search", id: valuePlies + 2, simulations: 0 });
      } catch (error) {
        fail(error);
      }
    });
    valueWorker.postMessage({ type: "init", id: 1, checkpoint: "final", local: false });
  });
} finally {
  await valueWorker.terminate();
}
console.log(JSON.stringify({ valueLookaheadMatchesSuccessorOracle: "PASS", completeValueLookaheadGamePlies: valuePlies }));
