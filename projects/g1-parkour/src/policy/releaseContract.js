// Matches Holosoma's wbt_distillation_g1 inference preset, not the exporter's
// legacy observation_names metadata (which is descriptive but out of order).
export const RELEASE_OBSERVATIONS = [
  'actions', 'base_ang_vel', 'dof_pos', 'dof_vel',
  'robot_anchor_projected_gravity', 'velocity_command',
];

export const RELEASE_DEPTH = Object.freeze({
  width: 106, height: 60, horizontalFovDeg: 89.5,
  near: 0.3, far: 3.0, cropTop: 2, cropBottom: 0, cropLeft: 4, cropRight: 4,
  outputWidth: 87, outputHeight: 58, renderHz: 10,
});

function cubic(x) {
  x = Math.abs(x);
  if (x <= 1) return ((1.5 * x - 2.5) * x) * x + 1;
  if (x < 2) return ((-0.5 * x + 2.5) * x - 4) * x + 2;
  return 0;
}

function weights(inputSize, outputSize) {
  const scale = inputSize / outputSize;
  const filterScale = Math.max(scale, 1);
  return Array.from({ length: outputSize }, (_, x) => {
    const center = (x + 0.5) * scale;
    const taps = [];
    let sum = 0;
    for (let i = Math.max(0, Math.ceil(center - 2 * filterScale - 0.5));
      i <= Math.min(inputSize - 1, Math.floor(center + 2 * filterScale - 0.5)); i++) {
      const value = cubic((i + 0.5 - center) / filterScale);
      taps.push([i, value]); sum += value;
    }
    return taps.map(([i, value]) => [i, value / sum]);
  });
}

// Separable antialiased bicubic resize: align_corners=False, a=-0.5, matching
// torch.interpolate(..., mode='bicubic', antialias=True) used by DepthShmPlugin.
export function resizeBicubic(input, inW, inH, outW, outH) {
  if (inW === outW && inH === outH) return Float32Array.from(input);
  const wx = weights(inW, outW), wy = weights(inH, outH);
  const horizontal = new Float32Array(outW * inH);
  for (let y = 0; y < inH; y++) for (let x = 0; x < outW; x++) {
    let sum = 0;
    for (const [i, w] of wx[x]) sum += input[y * inW + i] * w;
    horizontal[y * outW + x] = sum;
  }
  const result = new Float32Array(outW * outH);
  for (let y = 0; y < outH; y++) for (let x = 0; x < outW; x++) {
    let sum = 0;
    for (const [i, w] of wy[y]) sum += horizontal[i * outW + x] * w;
    result[y * outW + x] = sum;
  }
  return result;
}

export function preprocessDepth(data, width, height, { bottomUp = true } = {}) {
  const c = RELEASE_DEPTH;
  const w = width - c.cropLeft - c.cropRight, h = height - c.cropTop - c.cropBottom;
  if (w <= 0 || h <= 0 || data.length !== width * height) throw new Error('Invalid depth frame dimensions');
  const crop = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const topRow = y + c.cropTop;
    const sourceRow = bottomUp ? height - 1 - topRow : topRow;
    let value = data[sourceRow * width + x + c.cropLeft];
    if (Number.isNaN(value) || value === Infinity) value = c.far;
    if (value === -Infinity) value = c.near;
    crop[y * w + x] = Math.max(c.near, Math.min(c.far, value));
  }
  const result = resizeBicubic(crop, w, h, c.outputWidth, c.outputHeight);
  for (let i = 0; i < result.length; i++) {
    let value = Math.min(result[i], c.far);
    if (value < 0.15) value = c.far;
    result[i] = (value - c.near) / (c.far - c.near) - 0.5;
  }
  return result;
}
