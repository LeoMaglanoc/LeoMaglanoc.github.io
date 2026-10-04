import { C } from "./config.js";
import { distance, wrap } from "./math.js";
import { ArmIK } from "./ik.js";
import { ArmMotion, BaseController } from "./motion.js";
import { ObjectPool } from "./objects.js";
export class SortingTask {
  constructor(sim) {
    this.sim = sim;
    this.ik = new ArmIK(sim);
    this.motion = new ArmMotion(sim, this.ik);
    this.base = new BaseController(sim);
    this.reset();
  }
  reset(seed = C.seed) {
    const s = this.sim;
    s.reset();
    this.pool = new ObjectPool(s);
    if (seed !== C.seed) this.pool.reset(seed);
    s.pool = this.pool;
    this.stats = { sorted: 0, blue: 0, red: 0, retries: 0, drops: 0, recycled: 0 };
    this.target = null;
    this.motion.active = false;
    this.motion.target = null;
    this.base.v = 0;
    this.base.w = 0;
    this.base.goalKey = "";
    this.base.align = false;
    this.history = [];
    this.lastError = "";
    this.queued = null;
    this.enter("SETTLE", 2);
  }
  enter(state, timeout = 20) {
    this.state = state;
    this.since = this.sim.data.time;
    this.deadline = this.since + timeout;
    this.history.push({ state, time: this.since });
    if (this.history.length > 64) this.history.shift();
  }
  move(state, p, yaw, duration = 1.4) {
    this.motion.start(p, yaw, duration);
    this.enter(state, this.motion.duration + 5);
  }
  local(p) {
    const b = this.sim.basePose(),
      c = Math.cos(b[2]),
      s = Math.sin(b[2]);
    return [b[0] + c * p[0] - s * p[1], b[1] + s * p[0] + c * p[1], p[2]];
  }
  targetPose() {
    return this.sim.objectPose(this.target);
  }
  held() {
    const p = this.targetPose();
    return p[2] > 0.4 && distance(p.slice(0, 3), this.sim.tipPosition()) < 0.085;
  }
  fail(reason) {
    this.lastError = reason;
    this.motion.active = false;
    this.sim.open();
    this.base.stop();
    if (this.target) {
      this.target.attempts++;
      this.stats.retries++;
    }
    this.enter("RECOVER", 8);
    // Vertical retreat first; hold if IK cannot produce a safe reference.
    const p = this.sim.tipPosition();
    try {
      this.motion.start([p[0], p[1], Math.min(0.9, Math.max(p[2] + 0.08, 0.84))], this.yaw ?? Math.PI, 1.2);
    } catch (e) {
      this.motion.active = false;
    }
  }
  step() {
    const s = this.sim,
      now = s.data.time,
      elapsed = now - this.since;
    this.pool.update();
    if (this.target?.status === "carried" && !["OPEN", "VERIFY_PLACE", "RECOVER"].includes(this.state) && !this.held()) {
      this.stats.drops++;
      this.fail("Object slipped during transport");
    }
    if (now > this.deadline && this.state !== "RECOVER") this.fail(`${this.state} timed out`);
    try {
      switch (this.state) {
        case "SETTLE":
          this.base.stop();
          if (elapsed > 0.6) this.enter("SELECT");
          break;
        case "SELECT": {
          this.base.stop();
          const requested = this.pool.items.find((o) => o.id === this.queued && o.status === "input");
          this.target = requested ?? this.pool.choose();
          this.queued = null;
          if (this.target) this.enter("TO_INPUT", 40);
          break;
        }
        case "TO_INPUT":
          if (this.base.update(C.input.dock)) {
            const p = this.targetPose();
            if (p[2] < 0.7 || p[0] < 0.48 || p[0] > 0.87 || Math.abs(p[1]) > 0.24) {
              this.pool.recycle(this.target);
              this.stats.recycled++;
              this.target = null;
              this.enter("SELECT");
              break;
            }
            const objectYaw = Math.atan2(2 * (p[3] * p[6] + p[4] * p[5]), 1 - 2 * (p[5] * p[5] + p[6] * p[6]));
            // Parallel jaws have 180-degree symmetry; choose the nearer wrist orientation.
            const r = s.data.site_xmat.subarray(s.tip * 9, s.tip * 9 + 9),
              current = Math.atan2(-r[3], -r[0]);
            const candidates = [objectYaw, objectYaw + Math.PI];
            candidates.sort((a, b) => Math.abs(wrap(a - current)) - Math.abs(wrap(b - current)));
            // Wider-axis grasps are feasible too, but prefer the short axis.
            candidates.push(objectYaw + Math.PI / 2, objectYaw - Math.PI / 2);
            s.open();
            let planned = false;
            for (const yaw of candidates)
              try {
                this.motion.checkGrasp(p, yaw, this.local(C.carry));
                this.move("PREGRASP", [p[0], p[1], 0.85], yaw, 1.8);
                this.yaw = yaw;
                planned = true;
                break;
              } catch (e) {
                this.lastError = e.message;
              }
            if (!planned) this.fail("No reachable approach");
          }
          break;
        case "PREGRASP":
          this.base.stop();
          if (this.motion.update()) {
            const p = this.targetPose();
            this.initialHeight = p[2];
            this.move("DESCEND", [p[0], p[1], p[2] + 0.014], this.yaw, 1.1);
          }
          break;
        case "DESCEND":
          this.base.stop();
          if (this.motion.update()) {
            s.open(0);
            this.enter("CLOSE", 3);
          }
          break;
        case "CLOSE":
          this.base.stop();
          if (elapsed > 0.5) {
            const p = s.tipPosition();
            this.move("TEST_LIFT", [p[0], p[1], p[2] + 0.075], this.yaw, 1.1);
          }
          break;
        case "TEST_LIFT":
          this.base.stop();
          if (this.motion.update()) this.enter("VERIFY_GRASP", 2);
          break;
        case "VERIFY_GRASP":
          this.base.stop();
          if (elapsed > 0.2) {
            if (this.targetPose()[2] > this.initialHeight + 0.045 && this.held()) {
              this.target.status = "carried";
              this.pool.refill();
              this.move("RETRACT", this.local(C.carry), this.yaw, 1.8);
            } else this.fail("Lift did not retain object");
          }
          break;
        case "RETRACT":
          this.base.stop();
          if (this.motion.update()) this.enter("TO_OUTPUT", 45);
          break;
        case "TO_OUTPUT":
          if (this.base.update(C[this.target.color].dock)) {
            // Retain the actual object offset; place inside the bin instead of hovering over a wall.
            const station = C[this.target.color],
              tip = s.tipPosition(),
              p = this.targetPose();
            this.place = [station.center[0] + tip[0] - p[0], station.center[1] + tip[1] - p[1], 0.85];
            const r = s.data.site_xmat.subarray(s.tip * 9, s.tip * 9 + 9);
            this.yaw = Math.atan2(-r[3], -r[0]);
            this.move("ABOVE_BIN", this.place, this.yaw, 1.8);
          }
          break;
        case "ABOVE_BIN":
          this.base.stop();
          if (this.motion.update()) this.move("LOWER", [this.place[0], this.place[1], 0.78], this.yaw, 1);
          break;
        case "LOWER":
          this.base.stop();
          if (this.motion.update()) {
            s.open();
            this.enter("OPEN", 3);
          }
          break;
        case "OPEN":
          this.base.stop();
          if (elapsed > 0.35) {
            this.target.status = "released";
            this.enter("VERIFY_PLACE", 5);
          }
          break;
        case "VERIFY_PLACE":
          this.base.stop();
          if (this.pool.inBin(this.target)) {
            this.stats.sorted++;
            this.stats[this.target.color]++;
            this.target.status = "bin";
            this.target.recycleAt = now + 1.4;
            const p = s.tipPosition();
            this.move("CLEAR_BIN", [p[0], p[1], 0.88], this.yaw, 1);
            this.target = null;
          }
          break;
        case "CLEAR_BIN":
          this.base.stop();
          if (this.motion.update()) this.move("STOW", this.local(C.carry), this.yaw, 1.5);
          break;
        case "STOW":
          this.base.stop();
          if (this.motion.update()) {
            this.target = null;
            this.enter("RETURN", 45);
          }
          break;
        case "RETURN":
          if (this.base.update(C.input.dock)) this.enter("SELECT");
          break;
        case "RECOVER":
          this.base.stop();
          if ((!this.motion.active || this.motion.update() || now > this.deadline) && elapsed > 0.8) {
            if (this.target) {
              const p = this.targetPose();
              if (this.target.status !== "input" || p[2] < 0.7 || this.target.attempts >= 3) {
                this.pool.recycle(this.target);
                this.stats.recycled++;
              } else this.target.skipUntil = now + 3;
            }
            this.target = null;
            this.enter("RETURN", 45);
          }
          break;
      }
    } catch (e) {
      this.fail(e.message);
    }
    s.step();
  }
  snapshot() {
    return {
      state: this.state,
      time: this.sim.data.time,
      stats: { ...this.stats },
      base: this.sim.basePose(),
      tip: this.sim.tipPosition(),
      target: this.target?.id ?? null,
      color: this.target?.color ?? null,
      objects: this.pool.items.map((o) => ({ id: o.id, color: o.color, status: o.status, pose: this.sim.objectPose(o) })),
      lastError: this.lastError,
    };
  }
}
