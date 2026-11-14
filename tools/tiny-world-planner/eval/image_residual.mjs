// Experimental image-only online residual learning. No simulator, numerical
// goal, contact labels or diagnostic decoder participates in this update.
const D = 5;
function geometry(state) {
  const x = [],
    y = [];
  for (let i = 0; i < 4; i++) {
    x.push(state[i * 2] * Math.SQRT2);
    y.push(state[i * 2 + 1] * Math.SQRT2);
  }
  const center = [x.reduce((a, b) => a + b) / 4, y.reduce((a, b) => a + b) / 4],
    dx = x[1] - x[0],
    dy = y[1] - y[0],
    length = Math.max(1e-6, Math.hypot(dx, dy)),
    c = dx / length,
    s = dy / length;
  return {
    x,
    y,
    center,
    c,
    s,
    local(v) {
      return [v[0] * c + v[1] * s, -v[0] * s + v[1] * c];
    },
    world(v) {
      return [v[0] * c - v[1] * s, v[0] * s + v[1] * c];
    },
  };
}
function inputs(state, action) {
  const g = geometry(state),
    previous = geometry(state.subarray(24)),
    context = g.local([
      state[16] * 2 - g.center[0],
      state[17] * 2 - g.center[1],
    ]),
    a = g.local(action),
    v = g.local([
      g.center[0] - previous.center[0],
      g.center[1] - previous.center[1],
    ]),
    omega = Math.atan2(
      previous.c * g.s - previous.s * g.c,
      previous.c * g.c + previous.s * g.s,
    );
  return { g, context, features: [...a, ...v, omega] };
}
function solve(matrix, rhs) {
  const a = matrix.map((r, i) => [...r, ...rhs[i]]);
  for (let j = 0; j < D; j++) {
    let pivot = j;
    for (let i = j + 1; i < D; i++)
      if (Math.abs(a[i][j]) > Math.abs(a[pivot][j])) pivot = i;
    [a[j], a[pivot]] = [a[pivot], a[j]];
    const scale = a[j][j];
    if (Math.abs(scale) < 1e-12) return null;
    for (let k = j; k < D + 3; k++) a[j][k] /= scale;
    for (let i = 0; i < D; i++)
      if (i !== j) {
        const f = a[i][j];
        for (let k = j; k < D + 3; k++) a[i][k] -= f * a[j][k];
      }
  }
  return a.map((r) => r.slice(D));
}
export class ImageResidualModel {
  constructor(base) {
    this.base = base;
    this.metadata = base.metadata;
    this.memory = [];
    this.beta = null;
    this.context = null;
    this.trust = 0;
  }
  encode(o) {
    return this.base.encode(o);
  }
  goal(o) {
    return this.base.goal(o);
  }
  decode(s, n) {
    return this.base.decode(s, n);
  }
  prepare(state) {
    this.context = inputs(state, [0, 0]).context;
    const m = Array.from({ length: D }, (_, i) =>
        Array.from({ length: D }, (_, j) => (i === j ? 0.003 : 0)),
      ),
      rhs = Array.from({ length: D }, () => [0, 0, 0]);
    let sum = 0;
    for (const sample of this.memory) {
      const squared = sample.context.reduce(
          (a, v, i) => a + (v - this.context[i]) ** 2,
          0,
        ),
        w = Math.exp(-squared / (2 * 0.4 ** 2));
      if (w < 0.001) continue;
      sum += w;
      for (let i = 0; i < D; i++) {
        for (let j = 0; j < D; j++)
          m[i][j] += w * sample.features[i] * sample.features[j];
        for (let j = 0; j < 3; j++)
          rhs[i][j] += w * sample.features[i] * sample.residual[j];
      }
    }
    this.beta = solve(m, rhs);
    this.trust = Math.min(1, sum / 6);
  }
  async observe(previous, action, actual) {
    const predicted = await this.base.predict(
        previous,
        Float32Array.from(action),
        1,
      ),
      a = geometry(actual),
      p = geometry(predicted),
      input = inputs(previous, action),
      translation = input.g.local([
        a.center[0] - p.center[0],
        a.center[1] - p.center[1],
      ]),
      rotation = Math.atan2(p.c * a.s - p.s * a.c, p.c * a.c + p.s * a.s);
    if (![...translation, rotation].every(Number.isFinite)) return;
    this.memory.push({ ...input, residual: [...translation, rotation] });
    if (this.memory.length > 80) this.memory.shift();
  }
  async predict(states, actions, batch) {
    const out = await this.base.predict(states, actions, batch);
    if (!this.beta || !this.context) return out;
    for (let n = 0; n < batch; n++) {
      const input = inputs(
          states.subarray(n * 48, (n + 1) * 48),
          actions.subarray(n * 2, n * 2 + 2),
        ),
        squared = input.context.reduce(
          (a, v, i) => a + (v - this.context[i]) ** 2,
          0,
        ),
        weight = this.trust * Math.exp(-squared / (2 * 0.6 ** 2));
      if (weight < 0.001) continue;
      const correction = [0, 0, 0];
      for (let i = 0; i < D; i++)
        for (let j = 0; j < 3; j++)
          correction[j] += input.features[i] * this.beta[i][j] * weight;
      for (let j = 0; j < 3; j++)
        correction[j] = Math.max(-0.12, Math.min(0.12, correction[j]));
      const delta = input.g.world(correction),
        predicted = geometry(out.subarray(n * 48, (n + 1) * 48)),
        c = Math.cos(correction[2]),
        s = Math.sin(correction[2]);
      for (let k = 0; k < 4; k++) {
        const dx = predicted.x[k] - predicted.center[0],
          dy = predicted.y[k] - predicted.center[1],
          x = predicted.center[0] + c * dx - s * dy + delta[0],
          y = predicted.center[1] + s * dx + c * dy + delta[1];
        for (const start of [0, 8]) {
          out[n * 48 + start + k * 2] = x / Math.SQRT2;
          out[n * 48 + start + k * 2 + 1] = y / Math.SQRT2;
        }
      }
    }
    return out;
  }
}
