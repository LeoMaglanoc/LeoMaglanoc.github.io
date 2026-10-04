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
test("periodic trajectory wraps with continuous position, velocity and acceleration", () => {
  for (const key of ["p", "v", "a"]) {
    traj.sample(0)[key].forEach((x, i) => near(x, traj.sample(traj.duration)[key][i]));
    traj.sample(-1e-7)[key].forEach((x, i) => near(x, traj.sample(1e-7)[key][i], 1e-5));
  }
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
    spawn: { position: [0, 0, 1] },
    gates: [
      { position: [2, 0, 1], yaw: 0, width: 2, height: 2 },
      { position: [4, 0, 1], yaw: 0, width: 2, height: 2 },
    ],
  });
  race.update([3, 0, 1], 1);
  assert.equal(race.gate, 1);
  race.update([0, 0, 1], 2);
  race.update([3, 0, 1], 3);
  assert.equal(race.lap, 1, "start recrossing must not complete an unordered lap");
  race.update([5, 0, 1], 4);
  assert.equal(race.gate, 0);
  race.update([0, 0, 1], 5);
  race.update([3, 0, 1], 6);
  assert.equal(race.lap, 2);
  near(race.bestLapTime, 5);
  race.update([5, 0, 1], 7);
  race.update([0, 0, 1], 8);
  race.update([3, 0, 1], 9);
  assert.equal(race.lap, 3);
  near(race.bestLapTime, 3);
  race.reset();
  assert.equal(race.lap, 1);
  assert.equal(race.bestLapTime, null);
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

import { VEHICLE, motorResponse } from "../src/vehicle-config.js";
import { gateBasis, gateIntersection } from "../src/course.js";
test("canonical FPV scale and first order motor step", () => {
  near(2 * Math.hypot(...VEHICLE.motorPositions[0]), VEHICLE.wheelbase);
  const actual = new Float64Array(4),
    command = new Float64Array(4).fill(500);
  motorResponse(actual, command, VEHICLE.motorTimeConstant);
  near(actual[0], 500 * (1 - Math.exp(-1)));
  near(rotorWrench(mix([VEHICLE.mass * 9.81, 0, 0, 0]))[0], VEHICLE.mass * 9.81);
  near(rotorWrench(new Float64Array(4).fill(Math.sqrt(VEHICLE.maxRotorThrust / VEHICLE.thrustCoefficient)))[0], 4 * VEHICLE.maxRotorThrust);
});
test("rotated and pitched directional gate planes", () => {
  for (const yaw of [0, Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4, Math.PI])
    for (const pitch of [0, 0.3]) {
      const g = { position: [1, 2, 3], yaw, pitch, width: 2, height: 2 },
        b = gateBasis(g);
      const p = (n, h = 0) => g.position.map((x, i) => x + n * b.normal[i] + h * b.horizontal[i]);
      near(gateIntersection(p(-1), p(1), g), 0.5);
      assert.equal(gateIntersection(p(1), p(-1), g), null);
      assert.equal(gateIntersection(p(-1, 0.9), p(1, 0.9), g), null);
    }
});
test("heading uses all quadrants and MPC predicts across lap seam", () => {
  for (const [vx, vy] of [
    [1, 0],
    [0, 1],
    [-1, 0],
    [0, -1],
    [-1, -1],
  ]) {
    const t = new Trajectory({
      duration: 1,
      segmentDuration: 1,
      coefficients: [
        [
          [0, vx, 0, 0],
          [0, vy, 0, 0],
          [1, 0, 0, 0],
        ],
      ],
    });
    near(t.sample(0.1).yaw, Math.atan2(vy, vx));
  }
  const m = new TrackingMPC(),
    time = traj.duration - 0.1;
  const s = traj.sample(time);
  m.solve(s, traj, time);
  m.references.forEach((r, k) => r.p.forEach((x, i) => near(x, traj.sample(time + (k + 1) * m.dt).p[i])));
});

test("heading wrap at plus/minus pi is continuous as an attitude vector", () => {
  const t = new Trajectory({
    duration: 1,
    segmentDuration: 1,
    coefficients: [
      [
        [0, -1, 0, 0],
        [0, -0.001, 0.001, 0],
        [1, 0, 0, 0],
      ],
    ],
  });
  const a = t.sample(0.4999).yaw,
    b = t.sample(0.5001).yaw;
  assert.ok(a < 0 && b > 0);
  near(Math.cos(a), Math.cos(b), 1e-6);
  near(Math.sin(a), Math.sin(b), 1e-6);
});
test("lap contact episodes and clock keep running after completion", () => {
  const r = new Race({ spawn: { position: [0, 0, 1] }, gates: [{ position: [1, 0, 1], width: 2, height: 2, yaw: 0 }] });
  r.update([2, 0, 1], 1, true);
  r.update([0, 0, 1], 2, true);
  r.update([2, 0, 1], 3, false);
  assert.equal(r.lap, 2);
  assert.equal(r.laps[0].collisions, 1);
  r.update([2, 0, 1], 4, true);
  assert.equal(r.collisions, 2);
  assert.equal(r.collisionsThisLap, 1);
  assert.ok(r.currentLapTime > 1);
  assert.equal(r.time, 4);
});
