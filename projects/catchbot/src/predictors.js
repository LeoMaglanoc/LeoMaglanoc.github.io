import { CONFIG as C, boundTarget } from './config.js';
export function cleanEvents(events) {
  // Invalid events discarded; stable last-write-wins for duplicated timestamps.
  const byTime = new Map();
  for (const p of events)
    if ([p.t, p.x, p.y].every(Number.isFinite) && p.t >= 0)
      byTime.set(p.t, { t: p.t, x: p.x, y: p.y });
  return [...byTime.values()].sort((a, b) => a.t - b.t);
}
export function historyAt(events, cutoff, c = C) {
  const legal = cleanEvents(events).filter((p) => p.t <= cutoff + 1e-10);
  const end = Math.floor((cutoff + 1e-10) * c.sampleRate) / c.sampleRate;
  const start = end - (c.historyLength - 1) / c.sampleRate;
  if (!legal.length || start < legal[0].t - 1e-10) return null;
  const samples = [];
  let j = 0;
  for (let i = 0; i < c.historyLength; i++) {
    const t = start + i / c.sampleRate;
    // Zero-order hold: no interpolation through a sample's future events.
    while (j + 1 < legal.length && legal[j + 1].t <= t + 1e-10) j++;
    if (legal[j].t > t + 1e-10) return null;
    samples.push({ t, x: legal[j].x, y: legal[j].y, eventTime: legal[j].t });
  }
  return samples;
}
const median = (a) => {
  const s = [...a].sort((x, y) => x - y);
  return s.length % 2 ? s[s.length >> 1] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
export function velocity(history, window = C.velocityWindow) {
  // Theil–Sen slope: median of all pairwise slopes over the last 7 samples (200 ms).
  // Robust against a single erratic sample; fixed before all evaluation.
  const h = history.slice(-window),
    xs = [],
    ys = [];
  for (let i = 0; i < h.length; i++)
    for (let j = i + 1; j < h.length; j++) {
      const dt = h[j].t - h[i].t;
      if (dt > 1e-9) {
        xs.push((h[j].x - h[i].x) / dt);
        ys.push((h[j].y - h[i].y) / dt);
      }
    }
  return { x: xs.length ? median(xs) : 0, y: ys.length ? median(ys) : 0 };
}
export function predict(
  history,
  observationTime,
  horizon = C.horizon,
  generatedAt = observationTime + C.delay,
  modelName = 'velocity',
) {
  if (!history?.length || history.some((p) => p.t > observationTime + 1e-9))
    throw new Error('Missing or future history');
  if (!['reactive', 'velocity'].includes(modelName)) throw new Error('Unavailable predictor');
  const last = history.at(-1),
    v = modelName === 'velocity' ? velocity(history) : { x: 0, y: 0 };
  return {
    predictedPosition: boundTarget({ x: last.x + horizon * v.x, y: last.y + horizon * v.y }),
    generatedAt,
    sourceObservationTime: observationTime,
    targetTime: observationTime + horizon,
    latencyMs: 0,
    modelName,
  };
}
export function validPrediction(p, now, modelName) {
  return (
    p &&
    p.modelName === modelName &&
    [
      p.generatedAt,
      p.sourceObservationTime,
      p.targetTime,
      p.latencyMs,
      p.predictedPosition?.x,
      p.predictedPosition?.y,
    ].every(Number.isFinite) &&
    p.latencyMs >= 0 &&
    p.sourceObservationTime <= now - C.delay + 1e-8 &&
    p.generatedAt <= now + 1e-8 &&
    p.targetTime > now + 1e-9 &&
    Math.abs(p.targetTime - p.sourceObservationTime - C.horizon) < 1e-7
  );
}
// Async-ready generation gate. A reset or later request invalidates older work.
export class PredictionGate {
  constructor() {
    this.reset();
  }
  reset() {
    this.epoch = (this.epoch || 0) + 1;
    this.sequence = 0;
    this.latest = null;
    this.rejected = 0;
  }
  ticket() {
    return { epoch: this.epoch, sequence: ++this.sequence };
  }
  accept(ticket, prediction, now, mode) {
    if (
      ticket.epoch !== this.epoch ||
      ticket.sequence !== this.sequence ||
      !validPrediction(prediction, now, mode)
    ) {
      this.rejected++;
      return false;
    }
    this.latest = prediction;
    return true;
  }
}
