import { CONFIG as C, distance } from './config.js';
import { cleanEvents, historyAt, predict, validPrediction } from './predictors.js';
import { control } from './controller.js';
import { fk } from './robot.js';
export function summarize(values) {
  if (!values.length) return { n: 0, mean: null, median: null, p95: null };
  const a = [...values].sort((x, y) => x - y), at = q => a[Math.min(a.length - 1, Math.ceil(q * a.length) - 1)];
  return { n: a.length, mean: a.reduce((s, x) => s + x, 0) / a.length, median: at(0.5), p95: at(0.95) };
}
export function replay(rawEvents, mode, { protocol = 'algorithm', suppliedPredictions = null, endTime = null } = {}) {
  const events = cleanEvents(rawEvents);
  if (!events.length) return null;
  const first = events[0].t, end = endTime ?? events.at(-1).t;
  let q = [...C.initialQ], prediction = null, pending = null, next = first, index = 0, predIndex = 0;
  let interceptions = 0, firstInterception = null, contact = false, proximity = 0, steps = 0, expired = 0, warm = 0, failures = 0;
  const distances = [], latencies = [], errors = [], updates = [], positions = [];
  const supplied = suppliedPredictions ? [...suppliedPredictions].sort((a, b) => a.generatedAt - b.generatedAt) : null;
  const totalSteps = Math.floor((end - first) / C.dt + 1e-8);
  for (let k = 0; k <= totalSteps; k++) {
    const t = first + k * C.dt;
    while (index + 1 < events.length && events[index + 1].t <= t + 1e-9) index++;
    const target = events[index];
    if (pending && pending.ready <= t + 1e-9) {
      if (validPrediction(pending.p, t, mode)) prediction = pending.p;
      else expired++;
      pending = null;
    }
    if (supplied) {
      while (predIndex < supplied.length && supplied[predIndex].generatedAt <= t + 1e-9) {
        const p = supplied[predIndex++];
        const ready = p.generatedAt + (protocol === 'deployment' ? p.latencyMs / 1000 : 0);
        if (ready <= t + 1e-9 && validPrediction(p, t, mode)) prediction = p;
        else if (ready > t) pending = { p, ready };
        else expired++;
        latencies.push(p.latencyMs); updates.push(p);
      }
    } else if (t >= next - 1e-9) {
      next = t + C.predictionPeriod;
      const h = historyAt(events, t - C.delay);
      if (h) {
        const begin = performance.now(); const p = predict(h, h.at(-1).t, C.horizon, t, mode);
        p.latencyMs = performance.now() - begin; latencies.push(p.latencyMs); updates.push(p);
        if (protocol === 'deployment') pending = { p, ready: t + p.latencyMs / 1000 };
        else prediction = p;
      }
    }
    if (t < first + C.warmup - 1e-8) { warm++; continue; }
    const result = control(q, prediction, t, mode); q = result.q;
    if (result.status === 'expired') expired++;
    if (result.status === 'warming') failures++;
    const d = distance(fk(q).tip, target); distances.push(d); steps++;
    if (d <= C.proximityRadius) proximity += C.dt;
    if (!contact && d <= C.captureRadius) { contact = true; interceptions++; firstInterception ??= t - first - C.warmup; }
    if (d > C.captureRadius + 0.04) contact = false;
    positions.push({ t, q: [...q], distance: d });
  }
  // Ground truth is used AFTER prediction/control only, for scoring future error.
  for (const p of updates) {
    if (p.targetTime > end + 1e-9) continue;
    let j = 0; while (j + 1 < events.length && events[j + 1].t <= p.targetTime + 1e-9) j++;
    errors.push(distance(p.predictedPosition, events[j]));
  }
  return { model: mode, protocol, duration: end - first, interceptions, firstInterception, meanDistance: summarize(distances).mean,
    proximitySeconds: proximity, scoredSteps: steps, expiredSteps: expired, unavailableSteps: failures, warmingSteps: warm,
    fallbackRate: 0, holdRate: steps ? (expired + failures) / steps : 0, latencyMs: summarize(latencies), errorAt300ms: summarize(errors),
    predictions: updates, positions, forecastErrors: errors };
}
// Each resume starts a fresh causal history and fixed robot initial state for
// this *replay* comparison. This is distinct from continuing a live round.
export function traceSegments(trace) {
  const segments = []; let current = [];
  for (const p of trace.events) {
    if (p.kind === 'resume' && current.length) { segments.push(current); current = []; }
    if (['resume', 'move', 'sample'].includes(p.kind)) current.push({ t: p.t, x: p.x, y: p.y });
  }
  if (current.length) segments.push(current);
  return segments;
}
