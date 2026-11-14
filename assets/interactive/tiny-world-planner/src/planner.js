// Image-only learned-model CEM. No physics or diagnostic-decoder access.
export const CONFIGS = {
  lite: { horizon: 8, candidates: 128, iterations: 6, knots: 4 },
  standard: { horizon: 8, candidates: 256, iterations: 8, knots: 4 },
};
const clip = (x) => Math.max(-1, Math.min(1, x));
function rng(seed) {
  let s = seed;
  return () =>
    ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) + 0.5) / 4294967296;
}
const gaussian = (r) =>
  Math.sqrt(-2 * Math.log(r())) * Math.cos(2 * Math.PI * r());
export class CEM {
  constructor(model) {
    this.model = model;
    this.previous = null;
    this.random = rng(361);
  }
  reset() {
    this.previous = null;
    this.random = rng(361);
  }
  async plan(initial, goal, configuration = "lite") {
    const configurationValues = CONFIGS[configuration] || CONFIGS.lite;
    let observedCost = 0;
    for (let j = 0; j < 16; j++)
      observedCost += (initial[j] - goal[j]) ** 2 / 16;
    if (observedCost < 0.0004) {
      const started = performance.now(),
        latents = [];
      let state = initial;
      for (let k = 0; k < configurationValues.horizon; k++) {
        state = await this.model.predict(state, new Float32Array(2), 1);
        if (!state.every(Number.isFinite))
          throw Error("Non-finite neural prediction");
        latents.push(state);
      }
      this.previous = new Float32Array(configurationValues.horizon * 2);
      return {
        action: [0, 0],
        sequence: Array.from(this.previous),
        cost: observedCost,
        predicted: latents[0],
        latents,
        candidateLatents: [],
        holding: true,
        latency: performance.now() - started,
        config: configurationValues,
      };
    }

    const start = performance.now(),
      {
        horizon: H,
        candidates: N,
        iterations: I,
        knots: K = 4,
      } = configurationValues,
      E = Math.max(6, Math.floor(N * 0.1)),
      mean = new Float32Array(K * 2),
      std = new Float32Array(K * 2).fill(0.9),
      sequences = new Float32Array(N * H * 2);
    if (this.previous) {
      for (let k = 0; k < K; k++)
        for (let d = 0; d < 2; d++)
          mean[k * 2 + d] =
            this.previous[Math.min(H - 1, Math.floor((k * H) / K) + 1) * 2 + d];
    }
    let global = null;
    for (let iteration = 0; iteration < I; iteration++) {
      if (performance.now() - start > 12000) throw Error("Planning timeout");
      const controls = new Float32Array(N * K * 2);
      for (let n = 0; n < N; n++)
        for (let k = 0; k < K; k++)
          for (let d = 0; d < 2; d++) {
            let a;
            if (n === 0) a = mean[k * 2 + d];
            else if (n === 1) a = 0;
            else if (n < N * 0.2) a = gaussian(this.random);
            else a = mean[k * 2 + d] + std[k * 2 + d] * gaussian(this.random);
            controls[(n * K + k) * 2 + d] = clip(a);
          }
      for (let n = 0; n < N; n++)
        for (let k = 0; k < H; k++)
          for (let d = 0; d < 2; d++)
            sequences[(n * H + k) * 2 + d] =
              controls[(n * K + Math.floor((k * K) / H)) * 2 + d];
      let states = new Float32Array(N * 48);
      for (let n = 0; n < N; n++) states.set(initial, n * 48);
      const trajectory = [],
        costs = new Float64Array(N),
        actions = new Float32Array(N * 2);
      for (let t = 0; t < H; t++) {
        if (performance.now() - start > 12000) throw Error("Planning timeout");
        for (let n = 0; n < N; n++)
          actions.set(
            sequences.subarray((n * H + t) * 2, (n * H + t) * 2 + 2),
            n * 2,
          );
        states = await this.model.predict(states, actions, N);
        trajectory.push(states);
        for (let n = 0; n < N; n++) {
          let distance = 0;
          for (let j = 0; j < 16; j++)
            distance += (states[n * 48 + j] - goal[j]) ** 2;
          costs[n] += ((t === H - 1 ? 1 : 0.05 / H) * distance) / 16;
          for (let d = 0; d < 2; d++)
            costs[n] += 0.00002 * actions[n * 2 + d] ** 2;
        }
      }
      const rank = Array.from({ length: N }, (_, i) => i).sort(
          (a, b) => costs[a] - costs[b],
        ),
        best = rank[0];
      if (!Number.isFinite(costs[best])) throw Error("Non-finite cost");
      if (!global || costs[best] < global.cost)
        global = {
          cost: costs[best],
          sequence: sequences.slice(best * H * 2, (best + 1) * H * 2),
          latents: trajectory.map((s) => s.slice(best * 48, (best + 1) * 48)),
          candidateLatents: rank
            .slice(1, 5)
            .map((n) => trajectory.map((s) => s.slice(n * 48, (n + 1) * 48))),
        };
      for (let j = 0; j < K * 2; j++) {
        let m = 0;
        for (let e = 0; e < E; e++) m += controls[rank[e] * K * 2 + j] / E;
        let v = 0;
        for (let e = 0; e < E; e++)
          v += (controls[rank[e] * K * 2 + j] - m) ** 2 / E;
        mean[j] = m;
        std[j] = Math.max(0.025, Math.sqrt(v));
      }
    }
    this.previous = global.sequence;
    return {
      ...global,
      action: Array.from(global.sequence.slice(0, 2)),
      latency: performance.now() - start,
      predicted: global.latents[0],
      config: configurationValues,
    };
  }
}
