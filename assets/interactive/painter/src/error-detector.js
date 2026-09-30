import { C } from './config.js';
import { resampleStrokes } from './stroke-processing.js';
// Read only the robot ink raster. Red dots and yellow preview never enter perception.
export function detectMissing(strokes, rgba) {
  const paths = resampleStrokes(strokes, C.analysisSpacing, 12000);
  const errorMap = new Uint8Array(C.width * C.height);
  const samples = [];
  let desiredSamples = 0, missingSamples = 0;
  for (const points of paths) {
    const missing = points.map((p, i) => {
      const a = points[Math.max(0, i - 1)], b = points[Math.min(points.length - 1, i + 1)];
      const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
      const tx = dx / len, ty = dy / len;
      const alongLimit = i < 4 || i >= points.length - 4 ? 12 : 2;
      let covered = false;
      const radius = Math.ceil(Math.hypot(8, alongLimit));
      for (let y = Math.max(0, Math.floor(p[1]) - radius); y <= Math.min(C.height - 1, Math.ceil(p[1]) + radius) && !covered; y++) {
        for (let x = Math.max(0, Math.floor(p[0]) - radius); x <= Math.min(C.width - 1, Math.ceil(p[0]) + radius); x++) {
          if (rgba[(y * C.width + x) * 4] >= 200) continue;
          const ox = x - p[0], oy = y - p[1];
          if (Math.abs(ox * tx + oy * ty) <= alongLimit && Math.abs(-ox * ty + oy * tx) <= 8) { covered = true; break; }
        }
      }
      desiredSamples++;
      if (!covered) {
        missingSamples++;
        errorMap[Math.round(p[1]) * C.width + Math.round(p[0])] = 1;
      }
      return !covered;
    });
    samples.push({ points, missing });
  }
  return { errorMap, samples, desiredSamples, missingSamples, missingPercent: desiredSamples ? 100 * missingSamples / desiredSamples : 0 };
}
