import { C } from "./config.js";
import { seeded } from "./math.js";
export class ObjectPool {
  constructor(sim) {
    this.sim = sim;
    this.reset();
  }
  reset(seed = C.seed) {
    this.random = seeded(seed);
    this.serial = 0;
    this.items = this.sim.objects.map((o) => ({ ...o, status: "parked", attempts: 0, skipUntil: 0 }));
    for (const o of this.items) {
      this.sim.model.geom_contype[o.geom] = 0;
      this.sim.model.geom_conaffinity[o.geom] = 0;
    }
    this.refill();
  }
  spawn(o) {
    const s = this.sim,
      occupied = this.items.filter((x) => x.status === "input" && x !== o).map((x) => s.objectPose(x));
    let p;
    for (let i = 0; i < 300; i++) {
      const x = C.spawn.x[0] + this.random() * (C.spawn.x[1] - C.spawn.x[0]),
        y = C.spawn.y[0] + this.random() * (C.spawn.y[1] - C.spawn.y[0]);
      if (occupied.every((q) => Math.hypot(q[0] - x, q[1] - y) > 0.105)) {
        p = [x, y];
        break;
      }
    }
    if (!p) return false;
    const yaw = (this.random() * 2 - 1) * Math.PI;
    s.data.qpos.set([...p, C.tableTop + C.objectHalf[2] + 0.002, Math.cos(yaw / 2), 0, 0, Math.sin(yaw / 2)], o.qpos);
    s.data.qvel.fill(0, o.dof, o.dof + 6);
    s.data.qacc_warmstart.fill(0, o.dof, o.dof + 6);
    o.color = this.random() < 0.5 ? "blue" : "red";
    o.status = "input";
    o.attempts = 0;
    o.skipUntil = 0;
    o.serial = this.serial++;
    s.model.geom_contype[o.geom] = 1;
    s.model.geom_conaffinity[o.geom] = 3;
    s.model.geom_rgba.set(o.color === "blue" ? [0.16, 0.48, 0.85, 1] : [0.88, 0.27, 0.19, 1], o.geom * 4);
    s.mj.mj_forward(s.model, s.data);
    return true;
  }
  refill() {
    let count = this.items.filter((o) => o.status === "input").length;
    for (const o of this.items) if (count < C.inputCount && o.status === "parked" && this.spawn(o)) count++;
  }
  recycle(o) {
    const s = this.sim;
    o.status = "parked";
    s.model.geom_contype[o.geom] = 0;
    s.model.geom_conaffinity[o.geom] = 0;
    s.data.qpos.set([3, 3, -2 - o.id, 1, 0, 0, 0], o.qpos);
    s.data.qvel.fill(0, o.dof, o.dof + 6);
    s.data.qacc_warmstart.fill(0, o.dof, o.dof + 6);
    this.refill();
    s.mj.mj_forward(s.model, s.data);
  }
  update() {
    const now = this.sim.data.time;
    for (const o of this.items) if (o.status === "bin" && now >= o.recycleAt) this.recycle(o);
    this.refill();
  }
  choose() {
    const now = this.sim.data.time;
    return this.items.filter((o) => o.status === "input" && o.skipUntil <= now).sort((a, b) => a.serial - b.serial)[0] ?? null;
  }
  inBin(o) {
    const p = this.sim.objectPose(o),
      station = C[o.color];
    return (
      Math.abs(p[0] - station.center[0]) < 0.19 &&
      Math.abs(p[1] - station.center[1]) < 0.23 &&
      p[2] > 0.63 &&
      p[2] < 0.73 &&
      Math.hypot(...this.sim.data.qvel.subarray(o.dof, o.dof + 3)) < 0.15
    );
  }
}
