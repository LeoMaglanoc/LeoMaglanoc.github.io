import { PARAMS, mix } from "./drone.js";
import { clamp, cross, dot, normalize, rotation } from "./math.js";
export class FlightController {
  constructor() {
    this.integral = new Float64Array(3);
    this.wrench = new Float64Array(4);
  }
  reset() {
    this.integral.fill(0);
    this.wrench.fill(0);
  }
  command(s, ref, dt, mpcAcceleration = null, out = new Float64Array(4)) {
    // Translational acceleration -> desired body Z. Nominal mass remains fixed.
    const a = [0, 0, 0];
    for (let i = 0; i < 3; i++) {
      const ep = ref.p[i] - s.p[i];
      this.integral[i] = clamp(this.integral[i] + ep * dt, -2.5, 2.5);
      a[i] = clamp(
        (mpcAcceleration ? mpcAcceleration[i] : ref.a[i] + 5 * ep + 3.8 * (ref.v[i] - s.v[i])) +
          (i === 2 ? 0.8 : 0.25) * this.integral[i] +
          0.12 * s.v[i],
        i === 2 ? -5 : -7,
        i === 2 ? 7 : 7
      );
    }
    a[2] += PARAMS.gravity;
    const z = normalize(a),
      heading = [Math.cos(ref.yaw || 0), Math.sin(ref.yaw || 0), 0];
    const y = normalize(cross(z, heading)),
      x = cross(y, z),
      r = rotation(s.q);
    const current = [
      [r[0], r[3], r[6]],
      [r[1], r[4], r[7]],
      [r[2], r[5], r[8]],
    ];
    // Geometric attitude error: 1/2 sum(current axis cross desired axis), world -> body.
    const errors = current.map((axis, i) => cross(axis, [x, y, z][i]));
    const e = [0, 1, 2].map((i) => 0.5 * (errors[0][i] + errors[1][i] + errors[2][i]));
    this.wrench[0] = clamp(PARAMS.mass * dot(a, current[2]), 0, 4 * PARAMS.maxForce);
    for (let i = 0; i < 3; i++) this.wrench[i + 1] = PARAMS.inertia[i] * ((i === 2 ? 100 : 400) * dot(e, current[i]) - (i === 2 ? 20 : 32) * s.omega[i]);
    return mix(this.wrench, out);
  }
}
