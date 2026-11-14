import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createScene,
  coverage,
} from "../../../assets/interactive/tiny-world-planner/src/physics.js";
import { renderSensor } from "../../../assets/interactive/tiny-world-planner/src/raster.js";
import { masks } from "../../../assets/interactive/tiny-world-planner/src/observation.js";
test("fixed seeds replay exactly and contact moves/rotates block", () => {
  const a = createScene(42),
    b = createScene(42),
    start = a.state().object;
  for (let i = 0; i < 20; i++) {
    a.step([0.7, 0.1]);
    b.step([0.7, 0.1]);
  }
  assert.deepEqual(a.state(), b.state());
  assert.ok(a.state().contacts > 0);
  assert.ok(
    Math.hypot(a.state().object.x - start.x, a.state().object.y - start.y) >
      0.2,
  );
  assert.ok(Math.abs(a.state().object.angle - start.angle) > 0.01);
});
test("coverage uses union geometry without double counting", () => {
  const p = { x: 5, y: 5, angle: 0.7 };
  assert.ok(Math.abs(coverage(p, p) - 1) < 1e-9);
  assert.equal(coverage(p, { ...p, x: 9 }), 0);
  assert.ok(coverage(p, { ...p, x: 5.2 }) < 1);
});
test("pixel preprocessing separates object and agent and excludes goal overlays", () => {
  const s = createScene(1).state(),
    pixels = renderSensor(s.object, s.agent),
    m = masks(pixels);
  assert.ok(m.object.reduce((a, b) => a + b) > 70);
  assert.ok(m.agent.reduce((a, b) => a + b) > 2);
  assert.ok(m.object.every((v, i) => v + m.agent[i] <= 1.01));
  assert.deepEqual(
    masks(renderSensor(s.object, null)).agent,
    new Float32Array(4096),
  );
});
