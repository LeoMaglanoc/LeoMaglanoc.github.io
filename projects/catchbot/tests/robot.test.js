import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG as C, distance } from '../src/config.js';
import { fk, ik, stepRobot, angleDifference, projectReachable, caught } from '../src/robot.js';
const near = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) < e, `${a} != ${b}`);
test('FK manually checked straight, vertical and right-angle poses', () => {
  near(fk([0, 0]).tip.x, 0.92);
  near(fk([0, 0]).tip.y, 0);
  near(fk([Math.PI / 2, 0]).tip.x, 0);
  near(fk([Math.PI / 2, 0]).tip.y, 0.92);
  near(fk([0, Math.PI / 2]).tip.x, 0.46);
  near(fk([0, Math.PI / 2]).tip.y, 0.46);
});
test('IK/FK roundtrip throughout workspace, positive elbow branch', () => {
  for (let r = 0.01; r <= 0.92; r += 0.01)
    for (let a = -Math.PI; a < Math.PI; a += 0.1) {
      const p = { x: r * Math.cos(a), y: r * Math.sin(a) };
      const s = ik(p);
      assert.ok(distance(fk(s.q).tip, p) < 1e-8);
      assert.ok(s.q[1] >= 0 && s.q[1] <= Math.PI);
    }
});
test('workspace projection checks reachability before cosine clamping', () => {
  const s = ik({ x: 2, y: 0 });
  assert.equal(s.projected, true);
  near(s.point.x, 0.92);
  near(s.q[1], 0);
  assert.equal(projectReachable({ x: 0.92, y: 0 }).projected, false);
  const c = { ...C, l1: 0.6, l2: 0.2 };
  near(projectReachable({ x: 0, y: 0 }, c).point.x, 0.4);
});
test('singular origin and nearly straight poses remain finite', () => {
  for (const p of [
    { x: 0, y: 0 },
    { x: 1e-14, y: 1e-14 },
    { x: 0.92000000001, y: 0 },
  ])
    assert.ok(ik(p).q.every(Number.isFinite));
  near(ik({ x: 0, y: 0 }, [3, 1]).q[0], 3);
});
test('shoulder crossing +/- pi remains continuous', () => {
  near(angleDifference(-Math.PI + 0.01, Math.PI - 0.01), 0.02);
  const a = ik({ x: -0.5, y: 0.000001 }, [1.5, 1]);
  const b = ik({ x: -0.5, y: -0.000001 }, a.q);
  assert.ok(Math.abs(a.q[0] - b.q[0]) < 0.001);
});
test('servo obeys speed and elbow limits at every step', () => {
  let q = [0, 1];
  for (let i = 0; i < 2000; i++) {
    const goal = ik({ x: 0.87 * Math.cos(i / 9), y: 0.87 * Math.sin(i / 9) }, q).q;
    const n = stepRobot(q, goal);
    n.forEach((v, j) => assert.ok(Math.abs(v - q[j]) <= C.velocity[j] * C.dt + 1e-12));
    assert.ok(n[1] >= 0 && n[1] <= Math.PI);
    q = n;
  }
});
test('capture uses actual FK, never desired IK position', () => {
  const q = [0, 0];
  assert.ok(caught(q, { x: 0.92, y: 0 }));
  assert.ok(!caught(q, { x: 0, y: 0.92 }));
});
