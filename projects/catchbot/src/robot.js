import { CONFIG as C, clamp, distance } from './config.js';
export const angleDifference = (target, current) =>
  Math.atan2(Math.sin(target - current), Math.cos(target - current));
export function fk(q, c = C) {
  const elbow = { x: c.base.x + c.l1 * Math.cos(q[0]), y: c.base.y + c.l1 * Math.sin(q[0]) };
  return {
    elbow,
    tip: { x: elbow.x + c.l2 * Math.cos(q[0] + q[1]), y: elbow.y + c.l2 * Math.sin(q[0] + q[1]) },
  };
}
export function projectReachable(p, c = C) {
  const dx = p.x - c.base.x,
    dy = p.y - c.base.y,
    r = Math.hypot(dx, dy);
  const inner = Math.abs(c.l1 - c.l2),
    outer = c.l1 + c.l2;
  const radius = clamp(r, inner, outer);
  const k = r > 1e-12 ? radius / r : 0;
  return {
    point:
      r > 1e-12
        ? { x: c.base.x + k * dx, y: c.base.y + k * dy }
        : { x: c.base.x + inner, y: c.base.y },
    projected: r < inner || r > outer,
  };
}
export function ik(p, previous = C.initialQ, c = C) {
  const { point, projected } = projectReachable(p, c);
  const dx = point.x - c.base.x,
    dy = point.y - c.base.y;
  const c2 = (dx * dx + dy * dy - c.l1 ** 2 - c.l2 ** 2) / (2 * c.l1 * c.l2);
  const q2 = Math.acos(clamp(c2, -1, 1)); // fixed positive-elbow branch
  let q1 =
    Math.hypot(dx, dy) < 1e-10 && Math.abs(c.l1 - c.l2) < 1e-10
      ? previous[0]
      : Math.atan2(dy, dx) - Math.atan2(c.l2 * Math.sin(q2), c.l1 + c.l2 * Math.cos(q2));
  q1 = previous[0] + angleDifference(q1, previous[0]);
  return { q: [q1, clamp(q2, c.elbowMin, c.elbowMax)], projected, point };
}
export function stepRobot(q, desired, dt = C.dt, c = C) {
  // Shoulder is a continuous revolute joint; elbow has a physical [0, pi] range.
  // Elbow uses its direct feasible interval, never a wrap through its hard stop.
  return q.map((value, i) => {
    const error = i === 0 ? angleDifference(desired[i], value) : desired[i] - value;
    const next = value + clamp(c.kp * error, -c.velocity[i], c.velocity[i]) * dt;
    return i === 0 ? next : clamp(next, c.elbowMin, c.elbowMax);
  });
}
export const caught = (q, target, c = C) => distance(fk(q, c).tip, target) <= c.captureRadius;
