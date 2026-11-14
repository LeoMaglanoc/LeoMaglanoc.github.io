import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  CEM,
  CONFIGS,
} from "../../../assets/interactive/tiny-world-planner/src/planner.js";
test("batched CEM optimizes a learned-model interface, clips actions and repeats deterministically", async () => {
  let calls = 0;
  const model = {
    async predict(states, actions, batch) {
      calls++;
      assert.equal(batch, CONFIGS.lite.candidates);
      assert.equal(states.length, 48 * batch);
      const out = states.slice();
      for (let n = 0; n < batch; n++) out[n * 48] += actions[n * 2] * 0.2;
      return out;
    },
  };
  const p = new CEM(model),
    goal = new Float32Array(16);
  goal[0] = 1;
  const a = await p.plan(new Float32Array(48), goal);
  assert.equal(calls, CONFIGS.lite.horizon * CONFIGS.lite.iterations);
  assert.ok(a.action[0] > 0.2);
  assert.ok(a.sequence.every((v) => Math.abs(v) <= 1));
  p.reset();
  const b = await p.plan(new Float32Array(48), goal);
  assert.deepEqual(a.sequence, b.sequence);
});
test("deployed planner has no privileged imports or decoder-driven objectives", () => {
  const source = fs.readFileSync(
    new URL(
      "../../../assets/interactive/tiny-world-planner/src/planner.js",
      import.meta.url,
    ),
    "utf8",
  );
  assert.ok(!/^import\s.*(?:physics|raster|diagnostic)/m.test(source));
  assert.ok(!/\.decode\(/.test(source));
  const main = fs.readFileSync(
    new URL(
      "../../../assets/interactive/tiny-world-planner/src/main.js",
      import.meta.url,
    ),
    "utf8",
  );
  const message = main.match(
    /worker\.postMessage\(\{\s*type:\s*["']plan["'][\s\S]*?\}\)/,
  )[0];
  assert.ok(!/scene\.state|scene\.goal|contacts|velocity/.test(message));
});
test("nonfinite model output fails without executing a fallback action", async () => {
  const p = new CEM({
    async predict(s) {
      return new Float32Array(s.length).fill(NaN);
    },
  });
  await assert.rejects(
    () => p.plan(new Float32Array(48), new Float32Array(16)),
    /Non-finite/,
  );
});

test('visual-goal hold still displays learned future predictions', async () => {
  let calls = 0;
  const model = {async predict(state, action, batch) {
    calls++;
    assert.equal(batch, 1);
    assert.deepEqual(Array.from(action), [0, 0]);
    const next = state.slice();
    next[0] += .01;
    return next;
  }};
  const plan = await new CEM(model).plan(new Float32Array(48), new Float32Array(16));
  assert.deepEqual(plan.action, [0, 0]);
  assert.equal(calls, CONFIGS.lite.horizon);
  assert.ok(Math.abs(plan.predicted[0] - .01) < 1e-6);
  assert.ok(Math.abs(plan.latents.at(-1)[0] - .01 * calls) < 1e-6);
});
