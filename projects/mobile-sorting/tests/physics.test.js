import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { loadSimulation } from "./load-model.js";
import { SortingTask } from "../src/task.js";
import { C } from "../src/config.js";
import { distance } from "../src/math.js";
let sim, task;
before(async () => {
  sim = await loadSimulation();
  task = new SortingTask(sim);
});
after(() => task.ik.dispose());
function until(predicate, seconds = 80, hook = () => {}) {
  for (let i = 0; i < seconds / C.dt; i++) {
    task.step();
    hook();
    if (predicate()) return;
  }
  assert.fail(`Condition not reached: ${JSON.stringify(task.snapshot())}`);
}
test("TIAGo model has a free wheel-driven base, seven arm joints, two physical fingers and no attachment constraints", () => {
  assert.equal(sim.model.nu, 11);
  assert.equal(sim.model.nq, 53);
  assert.equal(sim.model.neq, 0);
  assert.equal(sim.objects.length, 5);
  assert.equal(sim.arm.length, 7);
  assert.equal(sim.fingers.length, 2);
  assert.equal(sim.model.jnt_type[0], 0); // mjJNT_FREE
  assert.ok(sim.model.geom("wheel_left_collision").id >= 0);
});
test("seeded spawn pool is separated, reachable and bounded across 100 seeds", () => {
  const colors = new Set();
  for (let seed = 0; seed < 100; seed++) {
    task.reset(seed);
    const objects = task.pool.items.filter((o) => o.status === "input");
    assert.equal(objects.length, 4);
    const poses = objects.map((o) => {
      colors.add(o.color);
      return sim.objectPose(o);
    });
    for (const p of poses) {
      assert.ok(p[0] >= C.spawn.x[0] && p[0] <= C.spawn.x[1]);
      assert.ok(p[1] >= C.spawn.y[0] && p[1] <= C.spawn.y[1]);
    }
    for (let i = 0; i < poses.length; i++)
      for (let j = i + 1; j < poses.length; j++) assert.ok(Math.hypot(poses[i][0] - poses[j][0], poses[i][1] - poses[j][1]) > 0.105);
    const first = JSON.stringify(poses);
    task.reset(seed);
    assert.equal(JSON.stringify(task.pool.items.filter((o) => o.status === "input").map((o) => sim.objectPose(o))), first);
  }
  assert.deepEqual([...colors].sort(), ["blue", "red"]);
});
test("a deferred failed object becomes eligible again instead of starving behind newly spawned boxes", () => {
  task.reset();
  const oldest = task.pool.choose();
  oldest.attempts = 1;
  oldest.skipUntil = sim.data.time + 3;
  assert.notEqual(task.pool.choose(), oldest);
  sim.data.time += 3.1;
  assert.equal(task.pool.choose(), oldest);
});
test("actual finger contact lifts a randomized object and retains it during wheel-driven translation and turning", () => {
  task.reset();
  until(() => task.state === "TO_OUTPUT");
  const o = task.target;
  assert.equal(o.status, "carried");
  assert.ok(sim.objectPose(o)[2] > 0.8);
  assert.ok(sim.fingers.every((j) => sim.data.qpos[j.qpos] > 0.01 && sim.data.qpos[j.qpos] < 0.04));
  let maxYaw = 0;
  until(
    () => task.state === "ABOVE_BIN",
    30,
    () => {
      maxYaw = Math.max(maxYaw, Math.abs(sim.basePose()[2]));
      assert.ok(distance(sim.objectPose(o).slice(0, 3), sim.tipPosition()) < 0.085);
    }
  );
  assert.ok(maxYaw > 1);
  assert.ok(Math.abs(sim.basePose()[1]) > 1.9);
  assert.equal(task.stats.drops, 0);
  until(() => task.stats.sorted === 1, 10);
  assert.ok(task.pool.inBin(o));
  assert.equal(o.color, "blue");
});
test("a forced failed table grasp causes a retreat and retry; a forced drop is recycled without false success", () => {
  task.reset();
  until(() => task.state === "CLOSE");
  const failed = task.target;
  until(
    () => task.state === "RECOVER",
    10,
    () => {
      if (["CLOSE", "TEST_LIFT", "VERIFY_GRASP"].includes(task.state)) sim.open();
    }
  );
  assert.equal(task.stats.sorted, 0);
  assert.equal(task.stats.retries, 1);
  assert.equal(failed.status, "input");
  until(() => task.state === "TO_OUTPUT", 90);
  const dropped = task.target;
  sim.data.qpos[dropped.qpos + 2] = 0.1;
  sim.data.qvel.fill(0, dropped.dof, dropped.dof + 6);
  sim.mj.mj_forward(sim.model, sim.data);
  task.step();
  assert.equal(task.state, "RECOVER");
  assert.equal(task.stats.drops, 1);
  until(() => task.state === "RETURN", 12);
  assert.ok(["input", "parked"].includes(dropped.status));
  assert.equal(task.stats.sorted, 0);
  until(() => task.stats.sorted >= 1, 100);
});
test("reset during carrying restores the complete robot, pool, FSM and counters without reloading", () => {
  task.reset(17);
  const original = JSON.stringify(task.snapshot());
  until(() => task.state === "TO_OUTPUT");
  task.reset(17);
  assert.equal(JSON.stringify(task.snapshot()), original);
  assert.ok([...sim.data.qvel].every((v) => v === 0));
});
test("endless loop sorts at least 100 objects across three seeds, with bounded bodies/history and continued progress", () => {
  const report = [];
  for (const [seed, seconds, minimum] of [
    [731, 4200, 90],
    [17, 650, 10],
    [2026, 650, 10],
  ]) {
    task.reset(seed);
    let lastScore = 0,
      lastProgress = 0,
      maxObjects = 0,
      graspChecks = 0;
    const started = performance.now();
    for (let i = 0; i < seconds / C.dt; i++) {
      task.step();
      if (i % 500 === 0) {
        const active = task.pool.items.filter((o) => o.status !== "parked").length;
        maxObjects = Math.max(maxObjects, active);
        assert.ok(active <= 5);
        assert.ok(task.history.length <= 64);
        assert.equal(sim.model.nq, 53);
        assert.ok([...sim.data.qpos, ...sim.data.qvel].every(Number.isFinite));
        if (task.stats.sorted > lastScore) {
          lastScore = task.stats.sorted;
          lastProgress = sim.data.time;
        }
        assert.ok(sim.data.time - lastProgress < 180, `No sorting progress: ${JSON.stringify(task.snapshot())}`);
        if (task.target?.status === "carried" && !["OPEN", "RECOVER"].includes(task.state)) {
          graspChecks++;
          assert.ok(task.held());
        }
      }
    }
    assert.ok(task.stats.sorted >= minimum, JSON.stringify(task.snapshot()));
    assert.ok(task.stats.blue > 0 && task.stats.red > 0);
    assert.ok(graspChecks > 20);
    const result = {
      seed,
      simulatedSeconds: seconds,
      wallSeconds: (performance.now() - started) / 1000,
      stats: { ...task.stats },
      maxObjects,
      graspChecks,
    };
    report.push(result);
    console.log("Soak", JSON.stringify(result));
  }
  assert.ok(report.reduce((n, r) => n + r.stats.sorted, 0) >= 100);
  if (process.env.SORTING_RESULTS) {
    fs.mkdirSync(process.env.SORTING_RESULTS, { recursive: true });
    fs.writeFileSync(process.env.SORTING_RESULTS + "/soak.json", JSON.stringify(report, null, 2));
  }
});
