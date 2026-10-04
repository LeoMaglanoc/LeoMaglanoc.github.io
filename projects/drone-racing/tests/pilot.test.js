import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Simulation } from "../src/simulation.js";
import { sceneXml } from "../src/course.js";
import { Trajectory } from "../src/trajectory.js";
import { Runner } from "../src/runner.js";
import { yawOf, angleDifference, rotation } from "../src/math.js";
const read = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
const course = await read("../course.json"),
  traj = new Trajectory(await read("../trajectories/race_v1.json"));
const xml = sceneXml(await readFile(new URL("../models/fpv.xml", import.meta.url), "utf8"), course);
const sim = await new Simulation().init(xml),
  r = new Runner(sim, traj, course);
const fly = (seconds, input = {}) => {
  for (let i = 0; i < seconds / sim.dt; i++) r.step(input);
};
for (const sign of [1, -1])
  test(`manual ${sign > 0 ? "left" : "right"} turn banks and releases to hover`, () => {
    r.mode = "FLY";
    r.reset(false);
    const initialYaw = yawOf(sim.state.q);
    fly(0.8, { forward: 1 });
    fly(1.2, { forward: 1, turn: sign });
    const yaw = angleDifference(yawOf(sim.state.q), initialYaw);
    assert.ok(sign * yaw > 0.8, `steering yaw ${yaw}`);
    const rot = rotation(sim.state.q),
      left = [-Math.sin(yawOf(sim.state.q)), Math.cos(yawOf(sim.state.q)), 0];
    const inward = rot[2] * left[0] + rot[5] * left[1];
    assert.ok(sign * inward > 0.2, `must bank inward: ${inward}`);
    assert.ok(Math.hypot(...sim.state.v) > 3);
    fly(4);
    assert.ok(Math.hypot(...sim.state.v) < 0.15, `release must settle: ${[...sim.state.v]}`);
    const held = [...sim.state.p];
    fly(2);
    assert.ok(Math.hypot(...held.map((x, i) => x - sim.state.p[i])) < 0.1);
  });
test("yaw alone rotates in place without banking into a moving turn", () => {
  r.mode = "FLY";
  r.reset(false);
  const p = [...sim.state.p],
    yaw = yawOf(sim.state.q);
  fly(1.5, { yaw: 1 });
  assert.ok(angleDifference(yawOf(sim.state.q), yaw) > 1);
  assert.ok(Math.hypot(...p.map((x, i) => x - sim.state.p[i])) < 0.15);
});
for (const [name, local] of Object.entries({ left: [0, 1], right: [0, -1], front: [1, 0], back: [-1, 0] }))
  test(`${name} push is a finite force, with visible displacement and recovery`, () => {
    r.mode = "FLY";
    r.reset(false);
    fly(1);
    const p = [...sim.state.p],
      v = [...sim.state.v],
      yaw = yawOf(sim.state.q),
      c = Math.cos(yaw),
      s = Math.sin(yaw);
    const direction = [c * local[0] - s * local[1], s * local[0] + c * local[1], 0];
    r.disturb(name);
    assert.deepEqual([...sim.state.p], p);
    assert.deepEqual([...sim.state.v], v, "push must not directly change velocity");
    sim.wind.forEach((x, i) => assert.ok(Math.abs(x - 4 * direction[i]) < 1e-8));
    fly(0.55);
    const offset = sim.state.p.reduce((total, x, i) => total + (x - p[i]) * direction[i], 0);
    assert.ok(offset > 0.2, `visible ${name} offset ${offset}`);
    fly(4);
    assert.ok(sim.wind.every((x) => x === 0));
    assert.equal(r.pushUntil, 0);
    assert.ok(Math.hypot(...p.map((x, i) => x - sim.state.p[i])) < 0.15, "returns to held position");
    assert.equal(r.resets, 0);
  });
