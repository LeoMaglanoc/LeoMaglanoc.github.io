import { C } from "./config.js";
import { clamp, distance, smooth, topDown, wrap } from "./math.js";
export class ArmMotion {
  constructor(sim, ik) {
    this.sim = sim;
    this.ik = ik;
    this.active = false;
  }
  plan(from, target, startYaw, yaw, seed) {
    // The transport and approach use top-down rotation; interpolate yaw by the shortest arc.
    const delta = wrap(yaw - startYaw),
      count = Math.max(5, Math.ceil(distance(from, target) / 0.018), Math.ceil(Math.abs(delta) / 0.15));
    const samples = [seed];
    let q = samples[0];
    for (let i = 1; i <= count; i++) {
      const t = i / count,
        p = from.map((v, j) => v + (target[j] - v) * t);
      q = this.ik.solve(p, topDown(startYaw + delta * t), q, target[2] < 0.79 ? 0.0015 : 0.004).q;
      samples.push(q);
    }
    return samples;
  }
  start(target, yaw, duration = 1.5) {
    const s = this.sim,
      rotation = s.data.site_xmat.subarray(s.tip * 9, s.tip * 9 + 9);
    const startYaw = Math.atan2(-rotation[3], -rotation[0]);
    const samples = this.plan(s.tipPosition(), target, startYaw, yaw, s.armPosition());
    const jointTravel = samples[0].map((_, j) => samples.slice(1).reduce((sum, q, i) => sum + Math.abs(q[j] - samples[i][j]), 0));
    this.duration = Math.max(duration, Math.max(...jointTravel) * 1.4);
    this.samples = samples;
    this.target = target;
    this.yaw = yaw;
    this.startTime = s.data.time;
    this.active = true;
    this.deadline = this.startTime + this.duration + 4;
  }
  checkGrasp(objectPosition, yaw, carry) {
    const s = this.sim,
      rotation = s.data.site_xmat.subarray(s.tip * 9, s.tip * 9 + 9);
    let from = s.tipPosition(),
      startYaw = Math.atan2(-rotation[3], -rotation[0]),
      q = s.armPosition();
    for (const target of [
      [objectPosition[0], objectPosition[1], 0.85],
      [objectPosition[0], objectPosition[1], objectPosition[2] + 0.014],
      [objectPosition[0], objectPosition[1], objectPosition[2] + 0.089],
      carry,
    ]) {
      q = this.plan(from, target, startYaw, yaw, q).at(-1);
      from = target;
      startYaw = yaw;
    }
  }
  update() {
    if (!this.active) return true;
    const s = this.sim,
      t = clamp((s.data.time - this.startTime) / this.duration, 0, 1),
      x = smooth(t) * (this.samples.length - 1),
      i = Math.min(Math.floor(x), this.samples.length - 2),
      f = x - i;
    s.setArm(this.samples[i].map((v, j) => v + (this.samples[i + 1][j] - v) * f));
    const done =
      t >= 1 &&
      distance(s.tipPosition(), this.target) < 0.009 &&
      Math.max(...s.armPosition().map((v, j) => Math.abs(v - this.samples.at(-1)[j]))) < 0.06;
    if (done) this.active = false;
    return done;
  }
}
export class BaseController {
  constructor(sim) {
    this.sim = sim;
    this.v = 0;
    this.w = 0;
    this.goalKey = "";
    this.align = false;
  }
  stop() {
    this.drive(0, 0);
  }
  drive(v, w) {
    // Wheel angular speeds drive the free base through real wheel/floor contacts.
    const s = this.sim,
      dt = C.dt;
    this.v += clamp(v - this.v, -0.3 * dt, 0.3 * dt);
    this.w += clamp(w - this.w, -1.4 * dt, 1.4 * dt);
    s.data.ctrl[s.wheels[0].act] = (this.v - (this.w * C.wheelTrack) / 2) / C.wheelRadius;
    s.data.ctrl[s.wheels[1].act] = (this.v + (this.w * C.wheelTrack) / 2) / C.wheelRadius;
  }
  update(goal) {
    const s = this.sim,
      p = s.basePose(),
      dx = goal[0] - p[0],
      dy = goal[1] - p[1],
      d = Math.hypot(dx, dy);
    const key = goal.join(",");
    if (key !== this.goalKey) {
      this.goalKey = key;
      this.align = false;
    }
    if (d < 0.035) this.align = true;
    if (d > 0.08) this.align = false;
    let v = 0,
      w = 0;
    if (!this.align) {
      const e = wrap(Math.atan2(dy, dx) - p[2]);
      w = clamp(2.4 * e, -0.9, 0.9);
      if (Math.abs(e) < 0.65) v = Math.min(0.3, 1.4 * d) * Math.max(0, Math.cos(e));
    } else w = clamp(2.4 * wrap(goal[2] - p[2]), -0.65, 0.65);
    this.drive(v, w);
    const vel = s.data.qvel;
    return (
      d < 0.05 &&
      Math.abs(wrap(goal[2] - p[2])) < 0.025 &&
      Math.hypot(vel[0], vel[1]) < 0.012 &&
      Math.abs(vel[5]) < 0.025 &&
      Math.abs(this.v) < 0.008 &&
      Math.abs(this.w) < 0.025
    );
  }
}
