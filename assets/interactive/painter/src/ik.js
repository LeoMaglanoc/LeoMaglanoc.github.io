// Independent damped least-squares implementation using MuJoCo's site Jacobian.
function solveLinear(matrix, vector) {
  const a = matrix.map((r, i) => [...r, vector[i]]);
  for (let k = 0; k < 6; k++) {
    let pivot = k;
    for (let i = k + 1; i < 6; i++) if (Math.abs(a[i][k]) > Math.abs(a[pivot][k])) pivot = i;
    [a[k], a[pivot]] = [a[pivot], a[k]];
    if (Math.abs(a[k][k]) < 1e-14) throw new Error("Singular IK system.");
    const divisor = a[k][k];
    for (let j = k; j <= 6; j++) a[k][j] /= divisor;
    for (let i = 0; i < 6; i++)
      if (i !== k) {
        const factor = a[i][k];
        for (let j = k; j <= 6; j++) a[i][j] -= factor * a[k][j];
      }
  }
  return a.map((r) => r[6]);
}
export class MarkerIK {
  constructor(simulation) {
    this.sim = simulation;
    const { mj, model, home, tip } = simulation;
    this.data = new mj.MjData(model);
    this.data.qpos.set(home);
    mj.mj_forward(model, this.data);
    this.rotation = Array.from(this.data.site_xmat.slice(tip * 9, tip * 9 + 9));
    this.jp = new mj.DoubleBuffer(3 * model.nv);
    this.jr = new mj.DoubleBuffer(3 * model.nv);
  }
  solve(target, seed, positionTolerance = 0.0015) {
    const { mj, model, tip } = this.sim;
    this.data.qpos.set(seed);
    for (let iteration = 0; iteration < 120; iteration++) {
      mj.mj_forward(model, this.data);
      const position = Array.from(this.data.site_xpos.slice(tip * 3, tip * 3 + 3));
      const rotation = this.data.site_xmat.subarray(tip * 9, tip * 9 + 9);
      const ep = target.map((v, i) => v - position[i]),
        er = [0, 0, 0];
      for (let axis = 0; axis < 3; axis++) {
        const a = [rotation[axis], rotation[3 + axis], rotation[6 + axis]];
        const b = [this.rotation[axis], this.rotation[3 + axis], this.rotation[6 + axis]];
        er[0] += (a[1] * b[2] - a[2] * b[1]) / 2;
        er[1] += (a[2] * b[0] - a[0] * b[2]) / 2;
        er[2] += (a[0] * b[1] - a[1] * b[0]) / 2;
      }
      if (Math.hypot(...ep) < positionTolerance && Math.hypot(...er) < 0.06)
        return { q: Float64Array.from(this.data.qpos), positionError: Math.hypot(...ep), orientationError: Math.hypot(...er) };
      mj.mj_jacSite(model, this.data, this.jp, this.jr, tip);
      const jp = this.jp.GetView(),
        jr = this.jr.GetView();
      const J = Array.from({ length: 6 }, (_, r) =>
        Array.from({ length: 7 }, (_, j) => (r < 3 ? jp[r * model.nv + j] : 0.08 * jr[(r - 3) * model.nv + j]))
      );
      const A = J.map((r, i) => J.map((s, k) => r.reduce((sum, v, j) => sum + v * s[j], i === k ? 5e-4 : 0)));
      const v = solveLinear(A, [...ep, ...er.map((x) => 0.08 * x)]);
      for (let j = 0; j < 7; j++) {
        const delta = J.reduce((sum, r, i) => sum + r[j] * v[i], 0);
        const q = this.data.qpos[j] + Math.max(-0.08, Math.min(0.08, delta));
        if (!Number.isFinite(q)) throw new Error("IK produced an invalid joint target.");
        this.data.qpos[j] = Math.max(model.jnt_range[j * 2] + 1e-4, Math.min(model.jnt_range[j * 2 + 1] - 1e-4, q));
      }
    }
    throw new Error("Marker target could not be reached. Try a smaller drawing near the center. No motion was started.");
  }
  dispose() {
    this.jp.delete();
    this.jr.delete();
    this.data.delete();
  }
}
