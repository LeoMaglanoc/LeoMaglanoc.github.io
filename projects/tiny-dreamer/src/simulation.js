import loadMujoco from "../../g1/vendor/mujoco.js";
import { observation, reward } from "./observation.js";

export async function loadJSON(url) {
  const response = await fetch(url);
  if (!response.ok)
    throw new Error(`Could not load ${url}: HTTP ${response.status}`);
  return response.json();
}

function randomGenerator(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let t = Math.imul(value ^ (value >>> 15), 1 | value);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Simulation {
  constructor(metadata) {
    this.metadata = metadata;
    this.pushRemaining = 0;
    this.pushForce = 0;
    this.action = 0;
    this.lastReward = 0;
    this.steps = 0;
  }

  async init() {
    this.mj = await loadMujoco();
    const response = await fetch(
      new URL("../models/cartpole.xml", import.meta.url),
    );
    if (!response.ok) throw new Error("CartPole model could not be loaded");
    this.mj.FS.writeFile("/cartpole.xml", await response.text());
    this.model = this.mj.MjModel.from_xml_path("/cartpole.xml");
    this.data = new this.mj.MjData(this.model);
    if (this.model.nq !== 2 || this.model.nu !== 1)
      throw new Error("Unexpected CartPole model contract");
    if (
      Math.abs(this.model.opt.timestep - this.metadata.physics_timestep) > 1e-9
    )
      throw new Error("Physics timestep mismatch");
    this.reset();
  }

  reset(seed = 7) {
    this.mj.mj_resetData(this.model, this.data);
    const random = randomGenerator(seed);
    const normal = () =>
      Math.sqrt(-2 * Math.log(Math.max(1e-12, random()))) *
      Math.cos(2 * Math.PI * random());
    this.data.qpos.set([0.01 * normal(), Math.PI + 0.01 * normal()]);
    this.data.qvel.set([0.01 * normal(), 0.01 * normal()]);
    this.mj.mj_forward(this.model, this.data);
    this.pushRemaining = 0;
    this.pushForce = 0;
    this.action = 0;
    this.lastReward = 0;
    this.steps = 0;
  }

  push(direction, strength = 5) {
    this.pushForce = direction * strength;
    this.pushRemaining = 0.2;
  }

  step(action) {
    if (!Number.isFinite(action))
      throw new Error("Policy produced a non-finite action");
    this.action = Math.max(
      this.metadata.action_min[0],
      Math.min(this.metadata.action_max[0], action),
    );
    this.data.ctrl[0] = this.action;
    let rewardSum = 0;
    for (let i = 0; i < this.metadata.action_repeat; i++) {
      this.data.qfrc_applied.fill(0);
      if (this.pushRemaining > 1e-9) {
        this.data.qfrc_applied[0] = this.pushForce;
        this.pushRemaining -= this.metadata.physics_timestep;
      }
      this.mj.mj_step(this.model, this.data);
      rewardSum += reward(this.data, this.action);
    }
    this.mj.mj_forward(this.model, this.data);
    this.lastReward = rewardSum / this.metadata.action_repeat;
    this.steps++;
    if (![...this.data.qpos, ...this.data.qvel].every(Number.isFinite))
      throw new Error("Physics diverged");
    return observation(this.data);
  }

  get observation() {
    return observation(this.data);
  }
  get time() {
    return this.steps * this.metadata.policy_timestep;
  }
  get reward() {
    return reward(this.data, this.action);
  }
}
