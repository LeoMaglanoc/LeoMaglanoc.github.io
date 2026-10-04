import { arcLengths, distance } from "./stroke-processing.js";
export function repairRuns(detection, start) {
  const candidates = [];
  for (const { points, missing } of detection.samples) {
    const lengths = arcLengths(points),
      runs = [];
    for (let i = 0; i < points.length; i++) {
      if (!missing[i]) continue;
      const a = i;
      while (i + 1 < points.length && missing[i + 1]) i++;
      const previous = runs.at(-1);
      if (previous && (lengths[a] - lengths[previous[1]]) / 85 <= distance(points[a], points[previous[1]]) / 135 + 0.55) previous[1] = i;
      else runs.push([a, i]);
    }
    for (let [a, b] of runs) {
      const low = lengths[a] - 12,
        high = lengths[b] + 12;
      while (a > 0 && lengths[a] > low) a--;
      while (b < points.length - 1 && lengths[b] < high) b++;
      if (b > a) candidates.push(points.slice(a, b + 1));
    }
  }
  const ordered = [];
  let current = start;
  while (candidates.length) {
    let best = 0,
      reverse = false,
      bestDistance = Infinity;
    candidates.forEach((p, i) => {
      const a = distance(current, p[0]),
        b = distance(current, p.at(-1));
      if (Math.min(a, b) < bestDistance) {
        best = i;
        reverse = b < a;
        bestDistance = Math.min(a, b);
      }
    });
    const path = candidates.splice(best, 1)[0];
    if (reverse) path.reverse();
    ordered.push(path);
    current = path.at(-1);
  }
  return ordered;
}
