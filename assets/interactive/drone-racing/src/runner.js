import { FlightController } from "./controller.js";
import { TrackingMPC } from "./mpc.js";
import { Race } from "./game.js";
export class Runner {
  constructor(sim, trajectory, course) {
    this.sim = sim;
    this.trajectory = trajectory;
    this.course = course;
    this.controller = new FlightController();
    this.mpc = new TrackingMPC();
    this.race = new Race(course);
    this.resets = 0;
    this.mode = "AUTOPILOT";
    this.ref = { p: [0, 0, 0], v: [0, 0, 0], a: [0, 0, 0], yaw: 0 };
    this.errorRef = { p: [0, 0, 0], v: [0, 0, 0], a: [0, 0, 0], yaw: 0 };
    this.reset(false);
  }
  reset(count = true) {
    if (count) this.resets++;
    this.sim.reset();
    this.controller.reset();
    this.mpc.reset();
    this.race.reset();
    this.steps = 0;
    this.time = 0;
    this.errorSquared = 0;
    this.maxError = 0;
    this.windUntil = 0;
    this.actual = [];
    this.manualTarget = [...this.course.spawn.position];
    this.manualYaw = this.course.spawn.yaw;
    this.acceleration = new Float64Array(3);
    this.ref.p.splice(0, 3, ...this.course.spawn.position);
    this.ref.v.fill(0);
    this.ref.a.fill(0);
    this.ref.yaw = this.course.spawn.yaw;
  }
  disturb(type) {
    if (type === "impulse") this.sim.impulse();
    if (type === "wind") {
      this.sim.wind[1] = 1.0;
      this.windUntil = this.time + 0.7;
    }
    if (type === "mass") this.sim.setMass(this.sim.massScale === 1 ? 1.2 : 1);
    if (type === "motor") this.sim.efficiency = this.sim.efficiency === 1 ? 0.9 : 1;
  }
  step(input = { forward: 0, strafe: 0, vertical: 0, yaw: 0 }) {
    const dt = this.sim.dt;
    if (this.mode === "AUTOPILOT") {
      this.trajectory.sample(this.time + this.course.referenceOffset, this.ref);
      if (this.steps % 10 === 0) this.acceleration.set(this.mpc.solve(this.sim.state, this.trajectory, this.time + this.course.referenceOffset));
    } else {
      this.manualYaw += input.yaw * dt * 1.6;
      const c = Math.cos(this.manualYaw),
        s = Math.sin(this.manualYaw),
        vx = (c * input.forward - s * input.strafe) * 3,
        vy = (s * input.forward + c * input.strafe) * 3;
      const velocities = [vx, vy, input.vertical * 1.8];
      for (let i = 0; i < 3; i++) {
        this.manualTarget[i] += velocities[i] * dt;
        // Bounded target lead avoids wind-up when the pilot flies into obstacles.
        this.manualTarget[i] = Math.max(this.sim.state.p[i] - 0.7, Math.min(this.sim.state.p[i] + 0.7, this.manualTarget[i]));
        if (i === 2) this.manualTarget[i] = Math.max(0.15, Math.min(5, this.manualTarget[i]));
        this.ref.p[i] = this.manualTarget[i];
        this.ref.v[i] = velocities[i];
        this.ref.a[i] = 0;
      }
      this.ref.yaw = this.manualYaw;
    }
    if (this.windUntil && this.time >= this.windUntil) {
      this.sim.wind.fill(0);
      this.windUntil = 0;
    }
    // Inner control 125 Hz, physics 250 Hz, MPC 25 Hz.
    if (this.steps % 2 === 0)
      this.controller.command(this.sim.state, this.ref, dt * 2, this.mode === "AUTOPILOT" ? this.acceleration : null, this.sim.motors);
    this.sim.step();
    this.steps++;
    this.time = this.steps * dt;
    this.race.update(this.sim.state.p, this.time, this.sim.data.ncon > 0);
    if (this.mode === "AUTOPILOT") {
      const target = this.trajectory.sample(this.time + this.course.referenceOffset, this.errorRef),
        p = this.sim.state.p,
        error = Math.hypot(target.p[0] - p[0], target.p[1] - p[1], target.p[2] - p[2]);
      this.errorSquared += error * error;
      this.maxError = Math.max(this.maxError, error);
    }
    if (this.steps % 5 === 0) {
      this.actual.push([...this.sim.state.p]);
      if (this.actual.length > 3000) this.actual.shift();
    }
  }
  metrics() {
    return {
      finishTime: this.race.finishTime,
      gates: this.race.gate,
      lap: this.race.lap,
      bestLapTime: this.race.bestLapTime,
      collisions: this.race.collisions,
      resets: this.resets,
      maxTrackingError: this.maxError,
      rmsTrackingError: Math.sqrt(this.errorSquared / Math.max(1, this.steps)),
      mpc: this.mpc.timing(),
    };
  }
}
