import { C } from './config.js';
import { pixelToWorld } from './coordinate-map.js';
import { resampleStrokes } from './stroke-processing.js';
export async function planPath(ik, strokes, initial, isCancelled = () => false, onProgress = () => {}) {
  const paths = resampleStrokes(strokes, C.planningSpacing, C.maxWaypoints - 3 * strokes.length);
  const targets = [];
  for (const p of paths) {
    targets.push({ position: pixelToWorld(p[0], C.hoverZ), markerDown: false });
    targets.push({ position: pixelToWorld(p[0]), markerDown: false });
    for (const point of p.slice(1)) targets.push({ position: pixelToWorld(point), markerDown: true });
    targets.push({ position: pixelToWorld(p.at(-1), C.hoverZ), markerDown: false });
  }
  if (!targets.length) throw new Error('Draw a stroke first.');
  let seed = Float64Array.from(initial);
  const plan = [];
  for (let i = 0; i < targets.length; i++) {
    if (isCancelled()) return null;
    const { position, markerDown } = targets[i];
    seed = ik.solve(position, seed).q;
    plan.push({ q: seed.slice(0, 7), markerDown });
    if (i % 12 === 0) {
      onProgress(i / targets.length);
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }
  return isCancelled() ? null : plan;
}
