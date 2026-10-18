import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  highObservation,
  lowObservation,
  integrateCommand,
  outcome,
} from "../src/contract.js";
const read = (n) =>
  JSON.parse(fs.readFileSync(new URL(`../${n}`, import.meta.url)));
const fixtures = read("results/reference-fixtures.json"),
  low = read("results/low-level-fixtures.json"),
  cfg = read("config.json");
function close(actual, expected, tolerance = 1e-6) {
  assert.equal(actual.length, expected.length);
  actual.forEach((v, i) =>
    assert.ok(
      Math.abs(v - expected[i]) <= tolerance,
      `index ${i}: ${v} vs ${expected[i]}`,
    ),
  );
}
test("13-D observation agrees with recorded native states and coordinate frames", () => {
  for (const f of fixtures.filter((f) => f.trace.length)) {
    close(
      highObservation(
        Float64Array.from(f.initial.qpos),
        Float64Array.from(f.initial.qvel),
        0,
        19,
        f.initial.target[0],
        new Float32Array(3),
        0,
      ),
      f.trace[0].obs,
    );
    for (const t of f.trace)
      close(
        highObservation(
          Float64Array.from(t.qpos),
          Float64Array.from(t.qvel),
          0,
          19,
          f.initial.target[0],
          Float32Array.from(t.next_obs.slice(-3)),
          0,
        ),
        t.next_obs,
      );
  }
});
test("47-D recurrent walker observation agrees with native 50 Hz traces", () => {
  const f = fixtures[0];
  for (let i = 0; i < Math.min(f.trace.length, 25); i++) {
    const t = f.trace[i],
      j = (i + 1) * 10 - 1;
    close(
      lowObservation(
        Float64Array.from(t.qpos),
        Float64Array.from(t.qvel),
        0,
        0,
        Array.from({ length: 12 }, (_, k) => 7 + k),
        Array.from({ length: 12 }, (_, k) => 6 + k),
        Float32Array.from(t.next_obs.slice(-3)),
        Float32Array.from(low[j - 1].action[0]),
        (i + 1) * 100,
        cfg.low_level,
      ),
      low[j].obs[0],
    );
  }
});
test("float32 coach command integration agrees with every recorded native step", () => {
  for (const f of fixtures.filter((f) => f.trace.length)) {
    const cmd = new Float32Array(3);
    for (const t of f.trace) {
      integrateCommand(cmd, t.action, cfg.high_level);
      close(cmd, t.next_obs.slice(-3), 0);
    }
  }
});
test("outcomes preserve native priority and target criterion", () => {
  for (const f of fixtures.filter((f) => f.trace.length)) {
    const t = f.trace.at(-1);
    assert.equal(
      outcome(
        Float64Array.from(t.qpos),
        0,
        19,
        f.initial.target[0],
        f.result.steps * 100,
        cfg,
      ),
      f.result.outcome,
    );
  }
  const q = Float64Array.from(fixtures[0].initial.qpos),
    target = [q[19], q[20]];
  assert.equal(outcome(q, 0, 19, target, 100, cfg), "success");
  q[2] = 0.1;
  assert.equal(outcome(q, 0, 19, target, 100, cfg), "fall");
  q[0] = NaN;
  assert.throws(() => outcome(q, 0, 19, target, 100, cfg), /non-finite/);
});
