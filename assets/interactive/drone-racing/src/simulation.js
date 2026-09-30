import loadMujoco from "../../g1/vendor/mujoco.js";
import { PARAMS, rotorWrench } from "./drone.js";
import { rotation, rotate } from "./math.js";
export class Simulation {
  constructor() {
    this.dt = 0.004;
    this.motors = new Float64Array(4);
    this.wrench = new Float64Array(4);
    this.force = new Float64Array(3);
    this.torque = new Float64Array(3);
    this.rotation = new Float64Array(9);
    this.bodyThrust = new Float64Array(3);
    this.wind = new Float64Array(3);
    this.massScale = 1;
    this.efficiency = 1;
  }
  async init(xml, options = {}) {
    this.mj = await loadMujoco(options);
    this.mj.FS.writeFile("/drone.xml", xml);
    this.model = this.mj.MjModel.from_xml_path("/drone.xml");
    this.data = new this.mj.MjData(this.model);
    this._state = {
      p: this.data.qpos.subarray(0, 3),
      q: this.data.qpos.subarray(3, 7),
      v: this.data.qvel.subarray(0, 3),
      omega: this.data.qvel.subarray(3, 6),
    };
    this.body = this.model.body("drone").id;
    this.reset();
    return this;
  }
  reset() {
    this.mj.mj_resetData(this.model, this.data);
    this.massScale = 1;
    this.efficiency = 1;
    this.wind.fill(0);
    this.motors.fill(0);
    this.model.body_mass[this.body] = PARAMS.mass;
    this.mj.mj_setConst(this.model, this.data);
    this.mj.mj_forward(this.model, this.data);
  }
  get state() {
    return this._state;
  }
  setMass(scale) {
    // mj_setConst temporarily evaluates the default pose; preserve live state.
    const qpos = this.data.qpos.slice(),
      qvel = this.data.qvel.slice(),
      time = this.data.time;
    this.massScale = scale;
    this.model.body_mass[this.body] = PARAMS.mass * scale;
    this.mj.mj_setConst(this.model, this.data);
    this.data.qpos.set(qpos);
    this.data.qvel.set(qvel);
    this.data.time = time;
    this.mj.mj_forward(this.model, this.data);
  }
  impulse(dv = [0, 1.2, 0]) {
    for (let i = 0; i < 3; i++) this.data.qvel[i] += dv[i];
  }
  step() {
    const s = this.state,
      r = rotation(s.q, this.rotation),
      w = rotorWrench(this.motors, this.wrench, this.efficiency);
    this.bodyThrust[2] = w[0];
    rotate(r, this.bodyThrust, this.force);
    rotate(r, w.subarray(1), this.torque);
    for (let i = 0; i < 3; i++) {
      this.force[i] += this.wind[i] - PARAMS.mass * 0.12 * s.v[i];
    }
    this.data.qfrc_applied.fill(0);
    // xfrc_applied is a world-frame wrench at the COM. mj_step refreshes
    // kinematics itself; mixing post-step qpos with stale xpos in mj_applyFT
    // would introduce an unintended lever arm (and cancel pitch torque).
    this.data.xfrc_applied.fill(0);
    this.data.xfrc_applied.set(this.force, this.body * 6);
    this.data.xfrc_applied.set(this.torque, this.body * 6 + 3);
    this.mj.mj_step(this.model, this.data);
    if (!this.data.qpos.every(Number.isFinite) || !this.data.qvel.every(Number.isFinite))
      throw new Error("Non-finite physics state. Reset to recover.");
  }
}
