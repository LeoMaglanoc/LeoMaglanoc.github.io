import assert from 'node:assert/strict';
import { G1Simulation } from '../src/simulation.js';

// Check world-space impulses against the robot's heading, including tilt.
const simulation = Object.create(G1Simulation.prototype);
simulation.stats = { pushes: 0 };
for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
  for (const roll of [0, 0.4]) {
    const c = Math.cos(roll / 2), s = Math.sin(roll / 2);
    simulation.data = { qpos: [0, 0, 0, Math.cos(yaw / 2) * c, Math.cos(yaw / 2) * s, Math.sin(yaw / 2) * s, Math.sin(yaw / 2) * c] };
    for (const direction of [-1, 1]) {
      simulation.applyPush(direction, 120);
      const [x, y, z] = simulation.push.force;
      const side = -direction;
      assert.ok(Math.abs(x - -Math.sin(yaw) * side * 120) < 1e-10);
      assert.ok(Math.abs(y - Math.cos(yaw) * side * 120) < 1e-10);
      assert.equal(z, 0);
      assert.ok(Math.abs(Math.hypot(x, y) - 120) < 1e-10);
      assert.equal(simulation.push.remaining, 0.18);
      // Turning after a push starts must not steer an impulse already in flight.
      simulation.data.qpos = [0, 0, 0, 1, 0, 0, 0];
      assert.deepEqual(simulation.push.force, [x, y, z]);
      simulation.data.qpos = [0, 0, 0, Math.cos(yaw / 2) * c, Math.cos(yaw / 2) * s, Math.sin(yaw / 2) * s, Math.sin(yaw / 2) * c];
    }
  }
}
assert.equal(simulation.stats.pushes, 16);
console.log('Heading-relative push checks passed (four headings, tilt, both directions).');
