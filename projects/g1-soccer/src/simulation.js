import { loadModel } from "./model.js";
import { Policies } from "./policy.js";
import {
  JOINTS,
  highObservation,
  lowObservation,
  integrateCommand,
  outcome,
} from "./contract.js";
import { loadAsset } from "./assets.js";
export class SoccerSimulation {
  async init() {
    const [loaded, cfg] = await Promise.all([
      loadModel(),
      loadAsset(
        new URL("../config.json", import.meta.url),
        "controller configuration",
        (r) => r.json(),
      ),
    ]);
    Object.assign(this, loaded);
    this.cfg = cfg;
    this.policies = new Policies();
    await this.policies.load();
    const jointId = (n) =>
      this.mj.mj_name2id(this.model, this.mj.mjtObj.mjOBJ_JOINT.value, n);
    const qpos = (n) => this.model.jnt_qposadr[jointId(n)],
      qvel = (n) => this.model.jnt_dofadr[jointId(n)];
    this.base = qpos("floating_base_joint");
    this.baseVel = qvel("floating_base_joint");
    this.ball = qpos("ball_joint");
    this.ballVel = qvel("ball_joint");
    this.mocap =
      this.model.body_mocapid[
        this.mj.mj_name2id(
          this.model,
          this.mj.mjtObj.mjOBJ_BODY.value,
          "target_marker",
        )
      ];
    this.positions = JOINTS.map(qpos);
    this.velocities = JOINTS.map(qvel);
    if (
      [
        this.base,
        this.baseVel,
        this.ball,
        this.ballVel,
        this.mocap,
        ...this.positions,
        ...this.velocities,
      ].some((v) => !Number.isInteger(v) || v < 0)
    )
      throw Error("Robot joint mapping is invalid.");
  }
  reset(layout) {
    this.mj.mj_resetData(this.model, this.data);
    this.data.qpos.set(layout.qpos);
    this.data.qvel.set(layout.qvel);
    this.data.mocap_pos.set(layout.target.flat(), this.mocap * 3);
    this.command = new Float32Array(3);
    this.action = new Float32Array(12);
    this.targets = Float32Array.from(this.cfg.low_level.default_angles);
    this.steps = 0;
    this.result = null;
    this.policies.reset();
    this.highAction = null;
    this.mj.mj_forward(this.model, this.data);
  }
  target() {
    return this.data.mocap_pos.subarray(this.mocap * 3, this.mocap * 3 + 2);
  }
  highObservation() {
    return highObservation(
      this.data.qpos,
      this.data.qvel,
      this.base,
      this.ball,
      this.target(),
      this.command,
      this.baseVel,
    );
  }
  async controlStep() {
    if (this.result) return;
    const c = this.cfg.low_level;
    if (this.steps % 100 === 0) {
      this.highObs = this.highObservation();
      this.highAction = await this.policies.high(this.highObs);
      if (
        this.highAction.length !== 3 ||
        !this.highAction.every(Number.isFinite)
      )
        throw Error("Invalid coach output.");
      integrateCommand(this.command, this.highAction, this.cfg.high_level);
    }
    for (let tick = 0; tick < c.control_decimation; tick++) {
      for (let i = 0; i < 12; i++)
        this.data.ctrl[i] =
          (this.targets[i] - this.data.qpos[this.positions[i]]) * c.kps[i] -
          this.data.qvel[this.velocities[i]] * c.kds[i];
      this.mj.mj_step(this.model, this.data);
      this.steps++;
    }
    const obs = lowObservation(
      this.data.qpos,
      this.data.qvel,
      this.base,
      this.baseVel,
      this.positions,
      this.velocities,
      this.command,
      this.action,
      this.steps,
      c,
    );
    this.action = await this.policies.low(obs);
    if (this.action.length !== 12 || !this.action.every(Number.isFinite))
      throw Error("Invalid walking-policy output.");
    for (let i = 0; i < 12; i++)
      this.targets[i] = Math.fround(
        Math.fround(this.action[i] * c.action_scale) +
          Math.fround(c.default_angles[i]),
      );
    if (this.steps % 100 === 0)
      this.result = outcome(
        this.data.qpos,
        this.base,
        this.ball,
        this.target(),
        this.steps,
        this.cfg,
      );
  }
  snapshot() {
    return {
      qpos: Array.from(this.data.qpos),
      qvel: Array.from(this.data.qvel),
      target: Array.from(this.target()),
      command: Array.from(this.command),
      time: this.steps * this.cfg.low_level.simulation_dt,
      result: this.result,
      ballIndex: this.ball,
      baseIndex: this.base,
      steps: this.steps,
    };
  }
}
