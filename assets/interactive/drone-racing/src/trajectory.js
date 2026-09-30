export class Trajectory {
  constructor(json) {
    Object.assign(this, json);
  }
  sample(time, out = { p: [0, 0, 0], v: [0, 0, 0], a: [0, 0, 0], yaw: 0 }) {
    const t = ((time % this.duration) + this.duration) % this.duration,
      h = this.segmentDuration;
    const i = Math.min(Math.floor(t / h), this.coefficients.length - 1),
      s = t - i * h;
    for (let axis = 0; axis < 3; axis++) {
      const [a, b, c, d] = this.coefficients[i][axis];
      out.p[axis] = a + s * (b + s * (c + s * d));
      out.v[axis] = b + s * (2 * c + 3 * s * d);
      out.a[axis] = 2 * c + 6 * s * d;
    }
    out.yaw = Math.hypot(out.v[0], out.v[1]) > 1e-6 ? Math.atan2(out.v[1], out.v[0]) : (out.yaw || 0);
    return out;
  }
}
