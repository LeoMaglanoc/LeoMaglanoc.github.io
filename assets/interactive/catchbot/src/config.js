// World units, seconds, radians. One configuration for every predictor/protocol.
export const CONFIG = Object.freeze({
  l1: 0.46,
  l2: 0.46,
  base: Object.freeze({ x: 0, y: 0 }),
  arenaRadius: 0.87,
  captureRadius: 0.062,
  proximityRadius: 0.15,
  kp: 6,
  velocity: Object.freeze([2.2, 2.8]),
  elbowMin: 0,
  elbowMax: Math.PI,
  initialQ: Object.freeze([-Math.PI / 2, 1.8]),
  dt: 1 / 60,
  sampleRate: 30,
  historyLength: 64,
  delay: 0.1,
  horizon: 0.3,
  predictionPeriod: 0.1,
  velocityWindow: 7,
  duration: 20,
  warmup: 2.4,
  suspensionThreshold: 0.25,
});
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export function boundTarget(p) {
  const r = Math.hypot(p.x, p.y);
  const k = r > CONFIG.arenaRadius ? CONFIG.arenaRadius / r : 1;
  return { x: p.x * k, y: p.y * k };
}
