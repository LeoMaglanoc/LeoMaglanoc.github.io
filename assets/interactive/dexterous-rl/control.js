// SPDX-License-Identifier: Apache-2.0
// Observation/action contract adapted from Wuji Technology, copyright 2026.
// Exact Wuji v2026.9.27 evaluation contract. Quaternions are w,x,y,z.
export const mul = (a, b) => [
  a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
  a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
  a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
  a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0],
];
export const inv = (q) => [q[0], -q[1], -q[2], -q[3]];
export const angle = (a, b) => (2 * Math.acos(Math.min(1, Math.abs(mul(a, inv(b))[0]))) * 180) / Math.PI;
export function matrix(q) {
  const [w, x, y, z] = q,
    s = 2 / q.reduce((a, v) => a + v * v, 0);
  return [
    1 - s * (y * y + z * z),
    s * (x * y - z * w),
    s * (x * z + y * w),
    s * (x * y + z * w),
    1 - s * (x * x + z * z),
    s * (y * z - x * w),
    s * (x * z - y * w),
    s * (y * z + x * w),
    1 - s * (x * x + y * y),
  ];
}
const clip = (v, l = -1, h = 1) => Math.max(l, Math.min(h, v));
export class Observation {
  constructor(c) {
    this.c = c;
    this.reset();
  }
  reset() {
    this.buffers = [];
  }
  build(qpos, tagPos, tagMat, prevTarget, goal, lastAction) {
    const c = this.c,
      norm = (v, i) => clip((v - (c.soft_lower[i] + c.soft_upper[i]) / 2) / ((c.soft_upper[i] - c.soft_lower[i]) / 2 + 1e-6));
    const joint = c.qadr.map((adr, i) => norm(qpos[adr], i));
    const err = joint.map((v, i) => v - norm(prevTarget[i], i));
    const delta = [0, 1, 2].map((i) => qpos[c.cube_qadr + i] - tagPos[i]);
    const pos = [0, 1, 2].map((i) => [0, 1, 2].reduce((sum, j) => sum + tagMat[j * 3 + i] * delta[j], 0));
    const ori = matrix(mul(Array.from(qpos.slice(c.cube_qadr + 3, c.cube_qadr + 7)), inv(goal))).slice(3);
    const terms = [joint, err, pos, ori, Array.from(lastAction)];
    const flat = [];
    terms.forEach((term, i) => {
      const v = Float32Array.from(term);
      if (!this.buffers[i]) this.buffers[i] = Array.from({ length: c.history_len }, () => v.slice());
      else {
        this.buffers[i].shift();
        this.buffers[i].push(v);
      }
      for (const frame of this.buffers[i]) flat.push(...frame);
    });
    return Float32Array.from(flat);
  }
}
export function applyAction(c, action, prev, step) {
  return c.default_joint_pos.map((v, i) =>
    step * c.ctrl_dt < c.warmup_time_s
      ? v
      : c.ema_alpha * clip(v + clip(action[i]) * c.action_scale, c.soft_lower[i], c.soft_upper[i]) + (1 - c.ema_alpha) * prev[i]
  );
}
// Shoemake uniform SO(3), rather than uniformly sampling Euler angles.
export function randomGoal() {
  const a = Math.random(),
    b = 2 * Math.PI * Math.random(),
    c = 2 * Math.PI * Math.random();
  return [Math.sqrt(a) * Math.cos(c), Math.sqrt(1 - a) * Math.sin(b), Math.sqrt(1 - a) * Math.cos(b), Math.sqrt(a) * Math.sin(c)];
}
