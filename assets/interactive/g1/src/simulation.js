import loadMujoco from "../vendor/mujoco.js";
import { G1_POLICY_CONFIG as C } from "./config.js";
import { buildObservation } from "./observations.js";
import { desiredJointPositions, pdControl } from "./controller.js";

function mkdirp(FS, path) {
  const parts = path.split("/").filter(Boolean);
  let current = "";
  for (const part of parts) {
    current += `/${part}`;
    if (!FS.analyzePath(current).exists) FS.mkdir(current);
  }
}

async function responseBytes(url, label) {
  const response = await fetch(url, { cache: "force-cache" });
  if (!response.ok) throw new Error(`Could not load ${label} (${response.status})`);
  return response.arrayBuffer();
}

export class G1Simulation {
  constructor(policy, commandManager, onUpdate) {
    this.policy = policy;
    this.commandManager = commandManager;
    this.onUpdate = onUpdate;
    this.mujoco = null;
    this.model = null;
    this.data = null;
    this.target = Float32Array.from(C.defaultAngles);
    this.action = new Float32Array(12);
    this.stepCount = 0;
    this.accumulator = 0;
    this.lastFrame = null;
    this.inferenceBusy = false;
    this.runToken = 0;
    this.paused = false;
    this.push = null;
    this.stats = { speed: 0, distance: 0, walkTime: 0, pushes: 0 };
    this.startPosition = [0, 0];
    this.pelvisBody = 1;
  }

  async init() {
    this.mujoco = await loadMujoco();
    const manifestUrl = new URL("../asset-manifest.json", import.meta.url);
    const manifest = await (await fetch(manifestUrl)).json();
    const root = "/working/g1";
    mkdirp(this.mujoco.FS, `${root}/meshes`);
    const baseUrl = new URL("../", import.meta.url);
    const scene = await (await fetch(new URL(manifest.scene, baseUrl))).text();
    const modelXml = await (await fetch(new URL(manifest.model, baseUrl))).text();
    this.mujoco.FS.writeFile(`${root}/scene.xml`, scene);
    this.mujoco.FS.writeFile(`${root}/g1_12dof.xml`, modelXml);
    await Promise.all(manifest.meshes.map(async (mesh) => {
      const bytes = await responseBytes(new URL(`../robots/g1/meshes/${mesh}`, import.meta.url), mesh);
      this.mujoco.FS.writeFile(`${root}/meshes/${mesh}`, new Uint8Array(bytes));
    }));

    this.model = this.mujoco.MjModel.from_xml_path(`${root}/scene.xml`);
    this.data = new this.mujoco.MjData(this.model);
    this.model.opt.timestep = C.simulationDt;
    this.mujoco.mj_forward(this.model, this.data);
    this.pelvisBody = this.model.body("pelvis")?.id ?? 1;
    this.startPosition = [this.data.qpos[0], this.data.qpos[1]];
    this.target = Float32Array.from(C.defaultAngles);
  }

  reset() {
    this.runToken += 1;
    this.mujoco.mj_resetData(this.model, this.data);
    this.mujoco.mj_forward(this.model, this.data);
    this.target.set(C.defaultAngles);
    this.action.fill(0);
    this.stepCount = 0;
    this.accumulator = 0;
    this.push = null;
    this.startPosition = [this.data.qpos[0], this.data.qpos[1]];
    this.stats = { speed: 0, distance: 0, walkTime: 0, pushes: 0 };
    this.policy.reset();
    this.onUpdate?.(this.data, this.stats);
  }

  setPaused(paused) {
    this.paused = paused;
  }

  applyPush(direction, strength) {
    this.push = { direction, strength, remaining: 0.18 };
    this.stats.pushes += 1;
  }

  schedulePolicy(command) {
    if (this.inferenceBusy || this.paused) return;
    const token = this.runToken;
    const observation = buildObservation(this.data, command, this.action, this.stepCount);
    this.inferenceBusy = true;
    this.policy.act(observation).then((action) => {
      if (token !== this.runToken) return;
      this.action.set(action.slice(0, 12));
      this.target.set(desiredJointPositions(this.action));
    }).catch((error) => this.onUpdate?.(this.data, this.stats, error)).finally(() => {
      this.inferenceBusy = false;
    });
  }

  stepPhysics() {
    const command = this.commandManager.update(C.simulationDt);
    const torque = pdControl(this.target, this.data.qpos, this.data.qvel);
    for (let i = 0; i < 12; i += 1) this.data.ctrl[i] = torque[i];
    this.data.qfrc_applied.fill(0);
    if (this.push) {
      const force = [0, this.push.direction * this.push.strength, 0];
      const point = [this.data.xpos[this.pelvisBody * 3], this.data.xpos[this.pelvisBody * 3 + 1], this.data.xpos[this.pelvisBody * 3 + 2]];
      this.mujoco.mj_applyFT(this.model, this.data, force, [0, 0, 0], point, this.pelvisBody, this.data.qfrc_applied);
      this.push.remaining -= C.simulationDt;
      if (this.push.remaining <= 0) this.push = null;
    }
    this.mujoco.mj_step(this.model, this.data);
    this.stepCount += 1;
    if (this.stepCount % C.controlDecimation === 0) this.schedulePolicy(command);
    this.updateStats();
  }

  updateStats() {
    this.stats.speed = Math.hypot(this.data.qvel[0], this.data.qvel[1]);
    this.stats.distance = Math.hypot(this.data.qpos[0] - this.startPosition[0], this.data.qpos[1] - this.startPosition[1]);
    this.stats.walkTime = this.stepCount * C.simulationDt;
  }

  advance(time) {
    if (this.lastFrame === null) this.lastFrame = time;
    const elapsed = Math.min(0.05, Math.max(0, (time - this.lastFrame) / 1000));
    this.lastFrame = time;
    if (!this.paused) {
      this.accumulator += elapsed;
      let steps = 0;
      while (this.accumulator >= C.simulationDt && steps < 25) {
        this.stepPhysics();
        this.accumulator -= C.simulationDt;
        steps += 1;
      }
    }
    this.onUpdate?.(this.data, this.stats);
  }
}
