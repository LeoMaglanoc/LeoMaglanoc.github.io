import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PARAMS, mix, rotorWrench } from "../src/drone.js";
import { rotation, rotate } from "../src/math.js";
import { gateCrossing } from "../src/course.js";
import { Trajectory } from "../src/trajectory.js";
import { TrackingMPC } from "../src/mpc.js";
import { Race } from "../src/game.js";
const near = (a, b, tol = 1e-7) => assert.ok(Math.abs(a - b) < tol, `${a} != ${b}`);
const traj = new Trajectory(JSON.parse(await readFile(new URL("../trajectories/race_v1.json", import.meta.url), "utf8")));
test("rotor model and unsaturated mixer inverse", () => {
  const wanted = [PARAMS.mass * 9.81, 0.001, -0.0007, 0.0002];
  const got = rotorWrench(mix(wanted));
  got.forEach((x, i) => near(x, wanted[i]));
  assert.ok(mix([100, 1, 1, 1]).every((w) => w >= 0 && w <= Math.sqrt(PARAMS.maxForce / PARAMS.kf)));
});
test("wxyz quaternion transforms and inverse", () => {
  const r = rotation([Math.SQRT1_2, 0, 0, Math.SQRT1_2]);
  rotate(r, [1, 0, 0]).forEach((x, i) => near(x, [0, 1, 0][i]));
});
test("trajectory starts, interpolates derivatives and ends stationary", () => {
  near(traj.sample(0).p[2], 1.5);
  near(traj.sample(traj.duration + 1).v[0], 0);
  const t = 3.23,
    h = 1e-5,
    a = traj.sample(t - h),
    b = traj.sample(t + h),
    c = traj.sample(t);
  for (let i = 0; i < 3; i++) near((b.p[i] - a.p[i]) / (2 * h), c.v[i], 1e-6);
});
test("ordered directional gate intersection and drone margin", () => {
  assert.ok(gateCrossing([0, 0, 1], [2, 0, 1], [1, 0, 1], [2, 2]));
  assert.ok(!gateCrossing([2, 0, 1], [0, 0, 1], [1, 0, 1], [2, 2]));
  assert.ok(!gateCrossing([0, 0.96, 1], [2, 0.96, 1], [1, 0, 1], [2, 2]));
  assert.ok(gateCrossing([0, 0, 1], [2, 1.5, 1], [1, 0, 1], [2, 2]));
  const race = new Race({
    start: [0, 0, 1],
    gates: [
      [2, 0, 1],
      [4, 0, 1],
    ],
    opening: [2, 2],
    droneRadius: 0.07,
  });
  race.update([1, 0, 1], 0.004);
  assert.equal(race.gate, 0);
  race.update([3, 0, 1], 0.008);
  assert.equal(race.gate, 1);
  race.update([5, 0, 1], 0.012);
  assert.equal(race.gate, 2);
  near(race.finishTime, 0.01);
  race.reset();
  assert.equal(race.finishTime, null);
});
test("MPC analytic gradient matches finite differences", () => {
  const m = new TrackingMPC(),
    s = { p: [0.2, -0.3, 1.2], v: [0.4, 0.5, 0.1] };
  m.references.forEach((r, k) => traj.sample(2 + (k + 1) * m.dt, r));
  m.u.forEach((_, i) => (m.u[i] = Math.sin(i)));
  m.cost(s, true);
  const gradient = m.gradient.slice(),
    h = 1e-5;
  for (let i = 0; i < m.u.length; i++) {
    const v = m.u[i];
    m.u[i] = v + h;
    const hi = m.cost(s);
    m.u[i] = v - h;
    const lo = m.cost(s);
    m.u[i] = v;
    near((hi - lo) / (2 * h), gradient[i], 1e-5);
  }
});
test("MPC reduces tracking cost, enforces bounds and resets warm starts", () => {
  const m = new TrackingMPC(),
    s = { p: [0, 0, 1.5], v: [0, 0, 0] };
  m.solve(s, traj, 2);
  assert.ok(m.finalCost < m.initialCost);
  assert.ok(m.u.every((x, i) => x >= (i % 3 === 2 ? -5 : -6) && x <= 6));
  assert.ok(m.lastSolve > 0);
  m.reset();
  assert.ok(m.u.every((x) => x === 0));
  assert.equal(m.times.length, 0);
});
