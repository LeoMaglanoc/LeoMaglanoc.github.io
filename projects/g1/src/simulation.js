import loadMujoco from "../vendor/mujoco.js";
import { loadAsset, loadMeshes } from "./assets.js";
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
    const manifest = await loadAsset(manifestUrl, "asset manifest", (response) => response.json());
    const root = "/working/g1";
    mkdirp(this.mujoco.FS, `${root}/meshes`);
    const baseUrl = new URL("../", import.meta.url);
    const scene = await loadAsset(new URL(manifest.scene, baseUrl), "scene XML", (response) => response.text());
    const modelXml = await loadAsset(new URL(manifest.model, baseUrl), "robot XML", (response) => response.text());
    this.mujoco.FS.writeFile(`${root}/scene.xml`, scene);
    this.mujoco.FS.writeFile(`${root}/g1_12dof.xml`, modelXml);
    await loadMeshes(manifest.meshes, async (mesh) => {
      const bytes = await loadAsset(new URL(`../robots/g1/meshes/${mesh}`, import.meta.url), mesh);
      this.mujoco.FS.writeFile(`${root}/meshes/${mesh}`, new Uint8Array(bytes));
    });

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
    this.lastFrame = null;
    this.paused = false;
    this.startPosition = [this.data.qpos[0], this.data.qpos[1]];
    this.stats = { speed: 0, distance: 0, walkTime: 0, pushes: 0 };
    this.policy.reset();
    this.onUpdate?.(this.data, this.stats);
  }

  setPaused(paused) {
    this.paused = paused;
  }

  applyPush(direction, strength) {
    // Capture the heading at the start of the impulse. MuJoCo uses w/x/y/z.
    const [w, x, y, z] = this.data.qpos.slice(3, 7);
    const yaw = Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z));
    // Local +Y is the robot's left; buttons pass -1 for left and +1 for right.
    const lateral = -direction * strength;
    const force = [-Math.sin(yaw) * lateral, Math.cos(yaw) * lateral, 0];
    this.push = { force, remaining: 0.18 };
    this.stats.pushes += 1;
  }

  schedulePolicy(command) {
    if (this.inferenceBusy || this.paused) return;
    const token = this.runToken;
    const observation = buildObservation(this.data, command, this.action, this.stepCount);
    this.inferenceBusy = true;
    this.policy
      .act(observation)
      .then((action) => {
        if (token !== this.runToken) return;
        this.action.set(action.slice(0, 12));
        this.target.set(desiredJointPositions(this.action));
      })
      .catch((error) => {
        if (token !== this.runToken) return;
        this.setPaused(true);
        this.onUpdate?.(this.data, this.stats, error);
      })
      .finally(() => {
        this.inferenceBusy = false;
      });
  }

  stepPhysics() {
    const command = this.commandManager.update(C.simulationDt);
    const torque = pdControl(this.target, this.data.qpos, this.data.qvel);
    for (let i = 0; i < 12; i += 1) this.data.ctrl[i] = torque[i];
    this.data.qfrc_applied.fill(0);
    if (this.push) {
      const force = this.push.force;
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
      // Keep inference synchronized with simulation time, even on slow frames.
      // Never skip a 50 Hz policy tick or integrate with a stale target while
      // its action is being computed. Bound backlog after stalls.
      this.accumulator = Math.min(0.05, this.accumulator + elapsed);
      let steps = 0;
      while (this.accumulator >= C.simulationDt && steps < 25 && !this.inferenceBusy) {
        this.stepPhysics();
        this.accumulator -= C.simulationDt;
        steps += 1;
      }
    }
    this.onUpdate?.(this.data, this.stats);
  }
}
