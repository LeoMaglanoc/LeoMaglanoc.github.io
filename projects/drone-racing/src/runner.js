import { Pilot } from "./pilot.js";
import { yawOf } from "./math.js";
import { FlightController } from "./controller.js";
import { TrackingMPC } from "./mpc.js";
import { Race } from "./game.js";
export class Runner {
  constructor(sim, trajectory, course) {
    this.sim = sim;
    this.trajectory = trajectory;
    this.course = course;
    this.controller = new FlightController();
    this.pilot = new Pilot();
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
    this.pushUntil = 0;
    this.pushFeedbackUntil = 0;
    this.pushLabel = "";
    this.actual = [];
    this.pilot.reset(this.course.spawn.position, this.course.spawn.yaw);
    this.acceleration = new Float64Array(3);
    this.ref.p.splice(0, 3, ...this.course.spawn.position);
    this.ref.v.fill(0);
    this.ref.a.fill(0);
    this.ref.yaw = this.course.spawn.yaw;
  }
  disturb(type) {
    const directions = { left: [0, 1], right: [0, -1], front: [1, 0], back: [-1, 0] };
    const local = directions[type];
    if (local) {
      const yaw = yawOf(this.sim.state.q),
        c = Math.cos(yaw),
        s = Math.sin(yaw);
      // World force is held fixed for the pulse, relative to heading at click.
      this.sim.wind.set([4 * (c * local[0] - s * local[1]), 4 * (s * local[0] + c * local[1]), 0]);
      this.pushUntil = this.time + 0.55;
      this.pushFeedbackUntil = this.pushUntil + 1.5;
      this.pushLabel = type;
    }
    if (type === "mass") this.sim.setMass(this.sim.massScale === 1 ? 1.2 : 1);
    if (type === "motor") this.sim.efficiency = this.sim.efficiency === 1 ? 0.9 : 1;
  }
  step(input = { forward: 0, strafe: 0, turn: 0, vertical: 0, yaw: 0 }) {
    const dt = this.sim.dt;
    if (this.mode === "AUTOPILOT") {
      this.trajectory.sample(this.time + this.course.referenceOffset, this.ref);
      if (this.steps % 10 === 0) this.acceleration.set(this.mpc.solve(this.sim.state, this.trajectory, this.time + this.course.referenceOffset));
    } else {
      this.pilot.update(this.sim.state, input, dt, this.ref);
    }
    if (this.pushUntil && this.time >= this.pushUntil) {
      this.sim.wind.fill(0);
      this.pushUntil = 0;
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
