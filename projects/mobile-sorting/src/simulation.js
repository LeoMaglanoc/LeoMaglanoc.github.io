import loadMujoco from "../../g1/vendor/mujoco.js";
import { C } from "./config.js";
export class SortingSimulation {
  async init(onProgress = () => {}) {
    this.mj = await loadMujoco();
    const root = "/sorting",
      base = new URL("../", import.meta.url),
      FS = this.mj.FS;
    FS.mkdir(root);
    FS.mkdir(root + "/assets");
    const fetchBytes = async (p) => {
      const r = await fetch(new URL(p, base));
      if (!r.ok) throw Error(`Asset ${p}: ${r.status}`);
      return new Uint8Array(await r.arrayBuffer());
    };
    const manifest = JSON.parse(new TextDecoder().decode(await fetchBytes("asset-manifest.json")));
    for (const name of ["scene.xml", "tiago.xml"]) FS.writeFile(`${root}/${name}`, await fetchBytes(`robots/tiago/${name}`));
    let n = 0;
    for (let i = 0; i < manifest.meshes.length; i += 6)
      await Promise.all(
        manifest.meshes.slice(i, i + 6).map(async (name) => {
          const path = `${root}/assets/${name}`,
            parts = path.split("/");
          let dir = "";
          for (const p of parts.slice(1, -1)) {
            dir += "/" + p;
            if (!FS.analyzePath(dir).exists) FS.mkdir(dir);
          }
          FS.writeFile(path, await fetchBytes(`robots/tiago/assets/${name}`));
          onProgress(++n / manifest.meshes.length);
        })
      );
    this.model = this.mj.MjModel.from_xml_path(`${root}/scene.xml`);
    this.data = new this.mj.MjData(this.model);
    this.bind();
    this.reset();
  }
  bind() {
    const m = this.model;
    const joint = (name) => {
      const id = m.jnt(name).id;
      return { id, qpos: m.jnt_qposadr[id], dof: m.jnt_dofadr[id], min: m.jnt_range[id * 2], max: m.jnt_range[id * 2 + 1] };
    };
    this.arm = Array.from({ length: 7 }, (_, i) => ({ ...joint(`arm_${i + 1}_joint`), act: m.actuator(`arm_${i + 1}`).id }));
    this.fingers = ["left", "right"].map((side) => ({ ...joint(`gripper_${side}_finger_joint`), act: m.actuator(`finger_${side}`).id }));
    this.wheels = ["left", "right"].map((side) => ({ ...joint(`wheel_${side}_joint`), act: m.actuator(`wheel_${side}`).id }));
    this.tip = m.site("grasp_site").id;
    this.base = m.body("base_link").id;
    this.objects = Array.from({ length: C.objectCount }, (_, i) => ({
      ...joint(`object_joint_${i}`),
      body: m.body(`object_${i}`).id,
      geom: m.geom(`object_geom_${i}`).id,
      id: i,
    }));
  }
  reset() {
    this.mj.mj_resetData(this.model, this.data);
    this.data.qpos[2] = 0.001;
    this.data.qpos[3] = 1;
    this.arm.forEach((j, i) => {
      this.data.qpos[j.qpos] = C.home[i];
      this.data.ctrl[j.act] = C.home[i];
    });
    this.fingers.forEach((j) => {
      this.data.qpos[j.qpos] = 0.045;
      this.data.ctrl[j.act] = 0.045;
    });
    for (const o of this.objects) {
      this.data.qpos[o.qpos] = 3;
      this.data.qpos[o.qpos + 1] = 3;
      this.data.qpos[o.qpos + 2] = -2 - o.id;
      this.data.qpos[o.qpos + 3] = 1;
    }
    this.mj.mj_forward(this.model, this.data);
  }
  armPosition() {
    return this.arm.map((j) => this.data.qpos[j.qpos]);
  }
  setArm(q) {
    this.arm.forEach((j, i) => (this.data.ctrl[j.act] = q[i]));
  }
  open(amount = 0.045) {
    this.fingers.forEach((j) => (this.data.ctrl[j.act] = amount));
  }
  tipPosition() {
    return Array.from(this.data.site_xpos.subarray(this.tip * 3, this.tip * 3 + 3));
  }
  basePose() {
    const q = this.data.qpos;
    return [q[0], q[1], Math.atan2(2 * (q[3] * q[6] + q[4] * q[5]), 1 - 2 * (q[5] * q[5] + q[6] * q[6]))];
  }
  objectPose(o) {
    return Array.from(this.data.qpos.subarray(o.qpos, o.qpos + 7));
  }
  step() {
    // Gravity feedforward is applied only to arm joints, never the base/objects.
    this.data.qfrc_applied.fill(0);
    for (const j of this.arm) this.data.qfrc_applied[j.dof] = this.data.qfrc_bias[j.dof];
    for (const o of this.pool?.items ?? []) if (o.status === "parked") this.data.qfrc_applied[o.dof + 2] = this.data.qfrc_bias[o.dof + 2];
    this.mj.mj_step(this.model, this.data);
  }
}
