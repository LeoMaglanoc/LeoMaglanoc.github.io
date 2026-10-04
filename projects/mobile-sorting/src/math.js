export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const wrap = (v) => Math.atan2(Math.sin(v), Math.cos(v));
export const distance = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));
export const smooth = (t) => {
  t = clamp(t, 0, 1);
  return t * t * t * (10 + t * (-15 + 6 * t));
};
export function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s += 0x6d2b79f5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function solveLinear(matrix, vector) {
  const a = matrix.map((r, i) => [...r, vector[i]]),
    n = vector.length;
  for (let k = 0; k < n; k++) {
    let pivot = k;
    for (let i = k + 1; i < n; i++) if (Math.abs(a[i][k]) > Math.abs(a[pivot][k])) pivot = i;
    [a[k], a[pivot]] = [a[pivot], a[k]];
    const v = a[k][k];
    if (Math.abs(v) < 1e-14) throw Error("Singular IK");
    for (let j = k; j <= n; j++) a[k][j] /= v;
    for (let i = 0; i < n; i++)
      if (i !== k) {
        const f = a[i][k];
        for (let j = k; j <= n; j++) a[i][j] -= f * a[k][j];
      }
  }
  return a.map((r) => r[n]);
}
export function matrixQuaternion(m) {
  const q = [0, 0, 0, 0],
    tr = m[0] + m[4] + m[8];
  if (tr > 0) {
    const s = 2 * Math.sqrt(tr + 1);
    q[0] = s / 4;
    q[1] = (m[7] - m[5]) / s;
    q[2] = (m[2] - m[6]) / s;
    q[3] = (m[3] - m[1]) / s;
  } else {
    let i = 0;
    if (m[4] > m[0]) i = 1;
    if (m[8] > m[i * 3 + i]) i = 2;
    const j = (i + 1) % 3,
      k = (i + 2) % 3,
      s = 2 * Math.sqrt(1 + m[i * 3 + i] - m[j * 3 + j] - m[k * 3 + k]);
    q[i + 1] = s / 4;
    q[0] = (m[k * 3 + j] - m[j * 3 + k]) / s;
    q[j + 1] = (m[j * 3 + i] + m[i * 3 + j]) / s;
    q[k + 1] = (m[k * 3 + i] + m[i * 3 + k]) / s;
  }
  return q;
}
export function orientationError(target, current) {
  const a = matrixQuaternion(target),
    b = matrixQuaternion(current);
  const w = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  const v = [
    -a[0] * b[1] + a[1] * b[0] - a[2] * b[3] + a[3] * b[2],
    -a[0] * b[2] + a[1] * b[3] + a[2] * b[0] - a[3] * b[1],
    -a[0] * b[3] - a[1] * b[2] + a[2] * b[1] + a[3] * b[0],
  ];
  const n = Math.hypot(...v),
    angle = 2 * Math.atan2(n, Math.abs(w));
  return v.map((x) => (n > 1e-8 ? (x * (w < 0 ? -1 : 1) * angle) / n : 0));
}
export function topDown(yaw) {
  const c = Math.cos(yaw),
    s = Math.sin(yaw);
  return [-c, -s, 0, -s, c, 0, 0, 0, -1];
}
