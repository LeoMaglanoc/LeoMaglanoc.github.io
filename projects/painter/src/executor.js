import { C } from "./config.js";
export class Executor {
  constructor(sim, ink) {
    this.sim = sim;
    this.ink = ink;
    this.path = null;
    this.lastInk = null;
  }
  get active() {
    return !!this.path;
  }
  start(path) {
    this.cancel();
    this.path = path;
    this.index = 0;
    this.begin();
  }
  cancel() {
    this.flushInk();
    this.path = null;
    this.lastInk = null;
    if (this.sim.data) this.sim.data.ctrl.set(this.sim.data.qpos.subarray(0, 7));
  }
  flushInk() {
    if (!this.lastInk) return;
    const p = this.sim.tipPosition();
    if (Math.hypot(p[0] - this.lastInk[0], p[1] - this.lastInk[1]) > 1e-6) this.ink.add(this.lastInk, p);
    this.lastInk = null;
  }
  begin() {
    const waypoint = this.path[this.index];
    if (!waypoint.markerDown) this.flushInk();
    else if (!this.lastInk) this.lastInk = this.sim.tipPosition();
    this.from = Float64Array.from(this.sim.data.ctrl.slice(0, 7));
    this.elapsed = 0;
    this.duration = Math.max(
      0.05,
      Math.max(...waypoint.q.map((q, i) => Math.abs(q - this.from[i]))) / (waypoint.markerDown ? C.drawSpeed : C.travelSpeed)
    );
    this.settle = waypoint.markerDown ? 0.15 : 0.25;
  }
  step() {
    if (this.path) {
      const goal = this.path[this.index];
      this.elapsed += C.dt;
      const blend = 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, this.elapsed / this.duration));
      for (let i = 0; i < 7; i++) this.sim.data.ctrl[i] = this.from[i] + blend * (goal.q[i] - this.from[i]);
    }
    this.sim.step();
    if (!this.path) return false;
    if (this.path[this.index].markerDown) {
      const p = this.sim.tipPosition();
      if (Math.hypot(p[0] - this.lastInk[0], p[1] - this.lastInk[1]) >= 0.002) {
        this.ink.add(this.lastInk, p);
        this.lastInk = p;
      }
    }
    if (this.elapsed >= this.duration + this.settle) {
      this.index++;
      if (this.index === this.path.length) {
        this.flushInk();
        this.path = null;
        return true;
      }
      this.begin();
    }
    return false;
  }
}
