import { imagine } from "./imagination.js";

export class Runner {
  constructor(simulation, policy) {
    this.sim = simulation;
    this.policy = policy;
    this.generation = 0;
    this.paused = false;
    this.showDream = true;
    this.dream = [];
    this.dreamTime = -Infinity;
    this.error = 0;
    this.previousPrediction = null;
    this.state = policy.initial();
    this.previousAction = 0;
    this.inferenceMs = 0;
  }

  reset(seed = 7) {
    this.generation++;
    this.sim.reset(seed);
    this.state = this.policy.initial();
    this.previousAction = 0;
    this.dream = [];
    this.dreamTime = -Infinity;
    this.error = 0;
    this.previousPrediction = null;
  }

  async step() {
    const token = this.generation;
    const begin = performance.now();
    const obs = this.sim.observation;
    const state = await this.policy.observe(
      this.state,
      this.previousAction,
      obs,
    );
    if (token !== this.generation) return;
    const action = await this.policy.act(state);
    if (token !== this.generation) return;
    const prediction = await this.policy.imagine(state, action);
    if (token !== this.generation) return;
    const nextObs = this.sim.step(action);
    const scale = this.policy.metadata.normalization.scale;
    this.error = Math.sqrt(
      nextObs.reduce(
        (sum, v, i) => sum + ((v - prediction.observation[i]) / scale[i]) ** 2,
        0,
      ) / nextObs.length,
    );
    this.previousPrediction = prediction.observation;
    this.state = state;
    this.previousAction = action;
    this.inferenceMs = performance.now() - begin;
    if (this.showDream && this.sim.time - this.dreamTime >= 0.5) {
      // Posterior is anchored before the physical step above; preserve its time.
      const dream = await imagine(this.policy, state);
      if (token !== this.generation) return;
      this.dream = dream;
      this.dreamTime = this.sim.time - this.policy.metadata.policy_timestep;
    }
  }
}
