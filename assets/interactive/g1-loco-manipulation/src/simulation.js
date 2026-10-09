import loadMujoco from "../../dexterous-rl/runtime/mujoco.js";
import { CarryBoxWTACPolicyRunner } from "./upstream/carryBoxWTACPolicyRunner.js";

export class Simulation {
  async init() {
    this.mj = await loadMujoco();
    this.config = await this.json("../config.json");
    this.references = await this.json("../references.json");
    this.config.onnx.path = new URL("../policy.onnx", import.meta.url).href;
    const files = await this.json("../asset-manifest.json");
    this.mj.FS.mkdir("/loco");
    this.mj.FS.mkdir("/loco/robots");
    this.mj.FS.mkdir("/loco/robots/meshes");
    for (let offset = 0; offset < files.length; offset += 6)
      await Promise.all(
        files.slice(offset, offset + 6).map(async (p) => {
          const r = await fetch(new URL("../" + p, import.meta.url));
          if (!r.ok) throw Error(`Asset ${p}: ${r.status}`);
          this.mj.FS.writeFile("/loco/" + p, new Uint8Array(await r.arrayBuffer()));
        })
      );
    this.task = "carrybox";
    this.loadModel();
    this.policy = new CarryBoxWTACPolicyRunner(this.config, {
      bodyNameToId: this.bodyIds,
      readBodyPose: (id) => this.policyPose(id),
    });
    await this.policy.init();
    this.startupError = 0;
    for (const frame of await this.json("../golden.json")) {
      const out = await this.policy._runRaw(Float32Array.from(frame.obs), 0);
      const values = out.actions.data;
      for (let i = 0; i < 29; i++) this.startupError = Math.max(this.startupError, Math.abs(values[i] - frame.actions[i]));
      for (const tensor of Object.values(out)) tensor.dispose();
    }
    if (this.startupError > 2e-4) throw Error("Native policy validation failed");
    this.reset({ task: "carrybox", start: [1, 0], goal: [2, 0.5] });
  }
  async json(p) {
    const r = await fetch(new URL(p, import.meta.url));
    if (!r.ok) throw Error(`${p}: ${r.status}`);
    return r.json();
  }
  loadModel() {
    this.data?.delete();
    this.fkData?.delete();
    this.model?.delete();
    this.model = this.mj.MjModel.from_xml_path(`/loco/robots/${this.task}.xml`);
    this.model.opt.disableflags |= 524288; // Disable multi-point CCD consistently with the native validation.
    this.data = new this.mj.MjData(this.model);
    this.fkData = new this.mj.MjData(this.model);
    this.bodyIds = {};
    for (const name of [
      "pelvis",
      "torso_link",
      "left_palm_link",
      "right_palm_link",
      "left_ankle_pitch_link",
      "right_ankle_pitch_link",
      "mid360_link",
      "box",
      "plane_1_holder",
      "plane_2_holder",
    ])
      this.bodyIds[name] = this.model.body(name).id;
    this.joints = this.config.policy_joint_names.map((name) => this.model.jnt(name).id);
    this.qa = this.joints.map((id) => this.model.jnt_qposadr[id]);
    this.va = this.joints.map((id) => this.model.jnt_dofadr[id]);
    this.ca = this.joints.map((id) => {
      for (let a = 0; a < this.model.nu; a++) if (this.model.actuator_trnid[a * 2] === id) return a;
      throw Error("Missing actuator for joint " + id);
    });
    this.boxQA = this.model.jnt_qposadr[this.model.jnt("box").id];
    this.dt = this.model.opt.timestep;
    if (Math.abs(this.dt - 0.005) > 1e-9) throw Error("Unexpected physics timestep");
  }
  pose(id) {
    return { pos: Float32Array.from(this.data.xpos.slice(id * 3, id * 3 + 3)), quat: Float32Array.from(this.data.xquat.slice(id * 4, id * 4 + 4)) };
  }
  policyPose(id) {
    if (id === this.bodyIds.box) return this.pose(id);
    return {
      pos: Float32Array.from(this.fkData.xpos.slice(id * 3, id * 3 + 3)),
      quat: Float32Array.from(this.fkData.xquat.slice(id * 4, id * 4 + 4)),
    };
  }
  state() {
    // Native CFtrack uses fresh FK from qpos, while the object sensor is mj_step's last body pose.
    this.fkData.qpos.set(this.data.qpos);
    this.mj.mj_kinematics(this.model, this.fkData);
    return {
      rootPos: Float32Array.from(this.data.qpos.slice(0, 3)),
      rootQuat: Float32Array.from(this.data.qpos.slice(3, 7)),
      rootAngVel: Float32Array.from(this.data.qvel.slice(3, 6)),
      jointPos: Float32Array.from(this.qa.map((a) => this.data.qpos[a])),
      jointVel: Float32Array.from(this.va.map((a) => this.data.qvel[a])),
    };
  }
  reset(settings) {
    if (this.busy) throw Error("Wait for the current policy update");
    this.paused = true;
    const changed = this.task !== settings.task;
    this.task = settings.task;
    if (changed) this.loadModel();
    this.settings = structuredClone(settings);
    this.mj.mj_resetData(this.model, this.data);
    const z = this.task === "carrybox" ? 0.55 : 0.26;
    this.data.qpos.set([...settings.start, z, 1, 0, 0, 0], this.boxQA);
    const halfZ = this.task === "carrybox" ? 0.15 : 0.26;
    for (const [name, xy] of [
      ["plane_1_holder", settings.start],
      ["plane_2_holder", settings.goal],
    ])
      this.data.mocap_pos.set([...xy, z - halfZ - 0.01], this.model.body_mocapid[this.bodyIds[name]] * 3);
    // The official reset performs one zero-control settling step before CFgen.
    this.mj.mj_step(this.model, this.data);
    this.policy.bodyNameToId = this.bodyIds;
    this.policy.task = this.task;
    this.policy.goalPos.set([...settings.goal, z]);
    this.policy.reset(this.state());
    const course = this.references.courses.find(
      (c) => c.start.every((v, i) => v === settings.start[i]) && c.goal.every((v, i) => v === settings.goal[i])
    );
    this.referenceMode = course ? "Native course · " + course.name : "Custom · experimental browser planner";
    if (course) this.applyReferences(this.references.tasks[this.task][course.id]);
    // Platforms are the original upstream physical support surfaces.
    for (const [name, pos] of [
      ["plane_1_holder", this.policy.plannerGoal.plane1],
      ["plane_2_holder", this.policy.plannerGoal.plane2],
    ]) {
      const mid = this.model.body_mocapid[this.bodyIds[name]];
      this.data.mocap_pos.set(pos, mid * 3);
    }
    this.ticks = 0;
    this.force = null;
    this.inferenceMs = 0;
    this.physicsMs = 0;
    this.elapsed = 0;
    this.wallStart = null;
    this.wallElapsed = 0;
    this.error = null;
    this.finished = false;
    return changed;
  }
  applyReferences(refs) {
    const fields = {
      refLeftWristPos: "ref_left_wrist_pos",
      refLeftWristQuat: "ref_left_wrist_quat",
      refRightWristPos: "ref_right_wrist_pos",
      refRightWristQuat: "ref_right_wrist_quat",
      refTorsoPos: "ref_torso_future_pos",
      refTorsoQuat: "ref_torso_future_quat",
      refLeftAnklePos: "ref_left_ankle_future_pos",
      refLeftAnkleQuat: "ref_left_ankle_future_quat",
      refRightAnklePos: "ref_right_ankle_future_pos",
      refRightAnkleQuat: "ref_right_ankle_future_quat",
      refContact: "ref_contact",
    };
    this.policy._makeRefArrays(refs.ref_contact.length);
    for (const [js, py] of Object.entries(fields)) this.policy[js] = refs[py].map((x) => Float32Array.from(x));
    this.policy.refPhase = refs.ref_phase;
  }
  disturb(object = false) {
    this.force = { body: this.bodyIds[object ? "box" : "pelvis"], value: object ? [0, 25, 0] : [0, 65, 0], remaining: 0.18 };
  }
  async tick() {
    if (this.paused || this.busy || this.finished) return;
    this.busy = true;
    try {
      let t = performance.now();
      const target = await this.policy.step(this.state());
      this.inferenceMs = performance.now() - t;
      // Pause can arrive while inference is pending. Finish this atomic control tick,
      // then stop; reset waits for this boundary and never races model replacement.
      t = performance.now();
      for (let step = 0; step < 4; step++) {
        for (let i = 0; i < 29; i++) {
          const a = this.ca[i];
          const torque = this.config.stiffness[i] * (target[i] - this.data.qpos[this.qa[i]]) - this.config.damping[i] * this.data.qvel[this.va[i]];
          this.data.ctrl[a] = Math.max(-this.config.torque_limits[i], Math.min(this.config.torque_limits[i], torque));
        }
        this.data.xfrc_applied.fill(0);
        if (this.force) {
          this.data.xfrc_applied.set(this.force.value, this.force.body * 6);
          this.force.remaining -= this.dt;
          if (this.force.remaining <= 0) this.force = null;
        }
        this.mj.mj_step(this.model, this.data);
      }
      this.physicsMs = performance.now() - t;
      this.ticks++;
      this.elapsed = this.ticks * 0.02;
      if (!Number.isFinite(this.data.qpos[2])) throw Error("Physics became non-finite");
      if (this.ticks >= this.policy.nframes) {
        this.finished = true;
        this.paused = true;
      }
    } catch (e) {
      this.error = e;
      this.paused = true;
      throw e;
    } finally {
      this.busy = false;
    }
  }
  get stats() {
    const box = this.pose(this.bodyIds.box).pos;
    const error = Math.hypot(box[0] - this.settings.goal[0], box[1] - this.settings.goal[1]);
    const placed = this.task === "carrybox" ? Math.abs(box[2] - 0.55) < 0.06 : box[2] > 0.2 && box[2] < 0.35;
    return {
      success: error < 0.2 && this.data.qpos[2] > 0.4 && placed,
      time: this.elapsed,
      height: this.data.qpos[2],
      box: Array.from(box),
      error,
      inferenceMs: this.inferenceMs,
      physicsMs: this.physicsMs,
      phase: this.policy.refPhase?.[this.policy.counterStep],
      pace: this.wallElapsed ? this.elapsed / (this.wallElapsed / 1000) : 0,
    };
  }
  async dispose() {
    this.paused = true;
    while (this.busy) await new Promise((r) => setTimeout(r, 10));
    await this.policy?.dispose();
    this.data?.delete();
    this.fkData?.delete();
    this.model?.delete();
  }
}
