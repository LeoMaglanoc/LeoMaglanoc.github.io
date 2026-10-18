import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG as C } from '../src/config.js';
import {
  historyAt,
  predict,
  cleanEvents,
  PredictionGate,
  validPrediction,
} from '../src/predictors.js';
const events = Array.from({ length: 121 }, (_, i) => ({
  t: i / 30,
  x: -0.3 + i / 300,
  y: 0.1 + i / 600,
}));
test('persistence uses last legal resampled observation', () => {
  const h = historyAt(events, 3);
  const p = predict(h, 3, 0.3, 3.1, 'reactive');
  assert.deepEqual(p.predictedPosition, { x: 0, y: 0.25 });
  assert.equal(p.targetTime, 3.3);
  assert.equal(p.sourceObservationTime, 3);
});
test('robust velocity predicts a known linear path', () => {
  const p = predict(historyAt(events, 3), 3, 0.3, 3.1, 'velocity');
  assert.ok(Math.abs(p.predictedPosition.x - 0.03) < 1e-9);
  assert.ok(Math.abs(p.predictedPosition.y - 0.265) < 1e-9);
});
test('future events do not influence histories or forecasts', () => {
  const cutoff = 3;
  const poisoned = events.map((p) => (p.t > cutoff ? { ...p, x: 1e7, y: -1e7 } : p));
  assert.deepEqual(historyAt(events, cutoff), historyAt(poisoned, cutoff));
});
test('irregular-event resampling only holds observations at or before each sample', () => {
  const e = [
    { t: 0, x: 0, y: 0 },
    { t: 0.071, x: 0.2, y: 0 },
    { t: 1.021, x: 0.4, y: 0 },
    { t: 2.19, x: 9, y: 9 },
  ];
  const h = historyAt(e, 2.15);
  assert.equal(h.length, 64);
  for (const s of h) {
    assert.ok(s.eventTime <= s.t + 1e-10);
    assert.ok(s.x !== 9);
  }
  assert.equal(h[0].x, 0);
});
test('invalid, reordered and duplicate event times are deterministic', () => {
  const x = cleanEvents([
    { t: 1, x: 0, y: 0 },
    { t: 0, x: 0, y: 0 },
    { t: 1, x: 2, y: 3 },
    { t: NaN, x: 0, y: 0 },
    { t: 2, x: Infinity, y: 0 },
  ]);
  assert.deepEqual(x, [
    { t: 0, x: 0, y: 0 },
    { t: 1, x: 2, y: 3 },
  ]);
});
test('missing early history does not get fabricated', () =>
  assert.equal(historyAt([{ t: 1, x: 0, y: 0 }], 2), null));
test('predictions obey legal workspace', () => {
  const e = events.map((p) => ({ ...p, x: p.x * 100 }));
  const p = predict(historyAt(e, 3), 3, 0.3, 3.1, 'velocity');
  assert.ok(Math.hypot(p.predictedPosition.x, p.predictedPosition.y) <= C.arenaRadius + 1e-10);
});
test('future cutoff and expired predictions rejected', () => {
  const p = predict(historyAt(events, 3), 3, 0.3, 3.1, 'velocity');
  assert.ok(validPrediction(p, 3.1, 'velocity'));
  assert.ok(!validPrediction(p, 3.01, 'velocity'));
  assert.ok(!validPrediction(p, 3.3, 'velocity'));
  assert.ok(!validPrediction(p, 3.1, 'timestral'));
  assert.ok(!validPrediction({ ...p, predictedPosition: { x: NaN, y: 1 } }, 3.1, 'velocity'));
});
test('delayed and reordered asynchronous results cannot corrupt current state', () => {
  const g = new PredictionGate(),
    a = g.ticket(),
    b = g.ticket(),
    p = predict(historyAt(events, 3), 3, 0.3, 3.1, 'velocity');
  assert.ok(!g.accept(a, p, 3.1, 'velocity'));
  assert.ok(g.accept(b, p, 3.1, 'velocity'));
  g.reset();
  assert.ok(!g.accept(b, p, 3.1, 'velocity'));
  const c = g.ticket();
  assert.ok(!g.accept(c, p, 4, 'velocity'));
});
test('predict rejects history after observationTime', () =>
  assert.throws(() => predict(events, 1)));
