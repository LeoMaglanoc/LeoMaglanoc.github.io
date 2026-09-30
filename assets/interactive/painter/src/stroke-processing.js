export const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
export function cleanStroke(points) {
  const out = [];
  for (const p of points) if (p.every(Number.isFinite) && (!out.length || distance(p, out.at(-1)) > 1e-9)) out.push([...p]);
  return out;
}
export function arcLengths(points) {
  const lengths = [0];
  for (let i = 1; i < points.length; i++) lengths.push(lengths.at(-1) + distance(points[i - 1], points[i]));
  return lengths;
}
export function resampleStroke(raw, spacing = 12) {
  const points = cleanStroke(raw);
  if (points.length < 2) return points;
  const lengths = arcLengths(points), total = lengths.at(-1), out = [points[0]];
  let j = 1;
  for (let d = spacing; d < total; d += spacing) {
    while (lengths[j] < d) j++;
    const t = (d - lengths[j - 1]) / (lengths[j] - lengths[j - 1]);
    out.push(points[j - 1].map((v, k) => v + t * (points[j][k] - v)));
  }
  out.push(points.at(-1));
  return out;
}
export function resampleStrokes(strokes, spacing = 12, budget = 1800) {
  const usable = strokes.map(cleanStroke).filter(p => p.length > 1);
  if (usable.length * 2 > budget) throw new Error('Too many disconnected strokes. Reset and draw fewer strokes.');
  const length = usable.reduce((sum, p) => sum + arcLengths(p).at(-1), 0);
  const step = Math.max(spacing, length / Math.max(1, budget - 2 * usable.length));
  return usable.map(p => resampleStroke(p, step));
}
export function pointSegmentDistance(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], length2 = dx * dx + dy * dy;
  const t = length2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length2)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}
