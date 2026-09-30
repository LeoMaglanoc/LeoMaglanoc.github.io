import test, { before } from "node:test";
import assert from "node:assert/strict";
import { loadSimulation } from "./load-model.js";
import { MarkerIK } from "../src/ik.js";
import { pixelToWorld, worldToPixel } from "../src/coordinate-map.js";
import { planPath } from "../src/planner.js";
import { Executor } from "../src/executor.js";
import { InkModel } from "../src/ink-model.js";
import { C } from "../src/config.js";
let sim, ik;
before(async () => {
  sim = await loadSimulation();
  ik = new MarkerIK(sim);
});
test("WASM model contract, seven arm joints, actuators, marker, canvas and home", () => {
  assert.equal(sim.model.nq, 9);
  assert.equal(sim.model.nu, 8);
  assert.equal(sim.model.nkey, 1);
  assert.ok(sim.model.geom("canvas").id >= 0);
  assert.ok(sim.tip >= 0);
  for (let j = 1; j <= 7; j++) assert.ok(sim.model.jnt(`joint${j}`).id >= 0);
});
test("IK contact and hover positions reachable at center and four corners, bounded and finite", () => {
  for (const p of [
    [319.5, 255.5],
    [0, 0],
    [639, 0],
    [0, 511],
    [639, 511],
  ])
    for (const z of [C.drawZ, C.hoverZ]) {
      const result = ik.solve(pixelToWorld(p, z), sim.home);
      assert.ok(result.positionError < 0.0015);
      assert.ok(result.orientationError < 0.06);
      for (let j = 0; j < 7; j++) {
        assert.ok(Number.isFinite(result.q[j]));
        assert.ok(result.q[j] >= sim.model.jnt_range[j * 2]);
        assert.ok(result.q[j] <= sim.model.jnt_range[j * 2 + 1]);
      }
    }
});
test("bias compensation reduces settled marker tracking error with unchanged Menagerie servos", () => {
  const target = pixelToWorld([320, 256]),
    q = ik.solve(target, sim.home).q;
  const errors = [];
  for (const compensated of [false, true]) {
    sim.reset();
    sim.data.qpos.set(q);
    sim.data.ctrl.set(q.slice(0, 7));
    sim.mj.mj_forward(sim.model, sim.data);
    for (let i = 0; i < 1000; i++) {
      if (compensated) sim.step();
      else {
        sim.data.qfrc_applied.fill(0);
        sim.mj.mj_step(sim.model, sim.data);
      }
    }
    errors.push(Math.hypot(...sim.tipPosition().map((v, i) => v - target[i])));
  }
  console.log("Settled tracking error: uncompensated / compensated (m)", errors);
  assert.ok(errors[1] < 0.0015);
  assert.ok(errors[1] < errors[0]);
});
test("whole-path planning, actual physical ink, pen-up separation and cancellation", async () => {
  sim.reset();
  const ink = new InkModel(),
    executor = new Executor(sim, ink);
  const paths = [
    [
      [100, 200],
      [220, 200],
    ],
    [
      [430, 340],
      [540, 340],
    ],
  ];
  const plan = await planPath(ik, paths, sim.home);
  assert.ok(plan.filter((p) => !p.markerDown).length >= 6);
  executor.start(plan);
  let steps = 0;
  while (executor.active && steps++ < 50000) executor.step();
  assert.ok(steps < 50000);
  assert.ok(ink.segments.length > 20);
  // No ink through the air between the disconnected strokes.
  for (const s of ink.segments) assert.ok(Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]) < 20);
  const first = worldToPixel(ink.segments[0].start);
  assert.ok(Math.hypot(first[0] - 100, first[1] - 200) < 15);
  assert.equal(await planPath(ik, paths, sim.home, () => true), null);
  executor.start(plan);
  for (let i = 0; i < 100; i++) executor.step();
  executor.cancel();
  const count = ink.segments.length;
  for (let i = 0; i < 100; i++) executor.step();
  assert.equal(ink.segments.length, count);
  ik.dispose();
});
