import { clamp, orientationError, solveLinear } from "./math.js";
export class ArmIK {
  constructor(sim) {
    this.sim = sim;
    this.data = new sim.mj.MjData(sim.model);
    this.jp = new sim.mj.DoubleBuffer(3 * sim.model.nv);
    this.jr = new sim.mj.DoubleBuffer(3 * sim.model.nv);
  }
  solve(position, rotation, seed = this.sim.armPosition(), tolerance = 0.002) {
    const { mj, model, tip, arm, data } = this.sim;
    this.data.qpos.set(data.qpos);
    arm.forEach((j, i) => (this.data.qpos[j.qpos] = seed[i]));
    let pe = Infinity,
      re = Infinity;
    for (let iteration = 0; iteration < 240; iteration++) {
      mj.mj_forward(model, this.data);
      const p = this.data.site_xpos.subarray(tip * 3, tip * 3 + 3),
        r = this.data.site_xmat.subarray(tip * 9, tip * 9 + 9);
      const ep = position.map((v, i) => v - p[i]),
        er = orientationError(rotation, r);
      pe = Math.hypot(...ep);
      re = Math.hypot(...er);
      if (pe < tolerance && re < 0.025) return { q: arm.map((j) => this.data.qpos[j.qpos]), pe, re };
      mj.mj_jacSite(model, this.data, this.jp, this.jr, tip);
      const jp = this.jp.GetView(),
        jr = this.jr.GetView(),
        weight = 0.25;
      const J = Array.from({ length: 6 }, (_, r) => arm.map((j) => (r < 3 ? jp[r * model.nv + j.dof] : weight * jr[(r - 3) * model.nv + j.dof])));
      const A = J.map((r, i) => J.map((s, k) => r.reduce((sum, x, j) => sum + x * s[j], i === k ? 0.00008 : 0)));
      const v = solveLinear(A, [...ep, ...er.map((x) => x * weight)]);
      arm.forEach((j, k) => {
        const dq = J.reduce((sum, r, i) => sum + r[k] * v[i], 0);
        this.data.qpos[j.qpos] = clamp(this.data.qpos[j.qpos] + clamp(dq, -0.12, 0.12), j.min + 0.002, j.max - 0.002);
      });
    }
    throw Error(`Unreachable arm target (${pe.toFixed(3)} m / ${re.toFixed(2)} rad)`);
  }
  dispose() {
    this.jp.delete();
    this.jr.delete();
    this.data.delete();
  }
}
