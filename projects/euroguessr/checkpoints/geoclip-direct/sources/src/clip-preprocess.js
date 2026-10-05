/* Pillow-compatible RGB bicubic resize + CLIP center crop. No canvas resampling. */
function cubic(x) {
  x = Math.abs(x);
  if (x < 1) return (1.5 * x - 2.5) * x * x + 1;
  if (x < 2) return ((-0.5 * x + 2.5) * x - 4) * x + 2;
  return 0;
}
function coefficients(input, output) {
  const scale = input / output,
    filter = Math.max(1, scale),
    support = 2 * filter,
    result = [];
  for (let i = 0; i < output; i++) {
    const center = (i + 0.5) * scale;
    const start = Math.max(0, Math.floor(center - support + 0.5)),
      end = Math.min(input, Math.floor(center + support + 0.5));
    const weights = [];
    let total = 0;
    for (let j = start; j < end; j++) {
      const v = cubic((j - center + 0.5) / filter);
      weights.push(v);
      total += v;
    }
    // Pillow stores signed 22-bit fixed-point coefficients for 8-bit RGB.
    result.push({ start, weights: weights.map((v) => Math.round((v / total) * (1 << 22))) });
  }
  return result;
}
const byte = (value) => Math.max(0, Math.min(255, Math.floor((value + (1 << 21)) / (1 << 22))));
export function clipResizeNormalize(rgba, width, height, size = 224) {
  const factor = size / Math.min(width, height),
    w = Math.floor(width * factor),
    h = Math.floor(height * factor);
  const horizontal = coefficients(width, w),
    vertical = coefficients(height, h),
    temp = new Uint8Array(w * height * 3),
    resized = new Uint8Array(w * h * 3);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < w; x++)
      for (let c = 0; c < 3; c++) {
        const { start, weights } = horizontal[x];
        let sum = 0;
        for (let j = 0; j < weights.length; j++) sum += rgba[(y * width + start + j) * 4 + c] * weights[j];
        temp[(y * w + x) * 3 + c] = byte(sum);
      }
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      for (let c = 0; c < 3; c++) {
        const { start, weights } = vertical[y];
        let sum = 0;
        for (let j = 0; j < weights.length; j++) sum += temp[((start + j) * w + x) * 3 + c] * weights[j];
        resized[(y * w + x) * 3 + c] = byte(sum);
      }
  const left = Math.floor((w - size) / 2),
    top = Math.floor((h - size) / 2),
    out = new Float32Array(3 * size * size);
  const mean = new Float32Array([0.48145466, 0.4578275, 0.40821073]),
    std = new Float32Array([0.26862954, 0.26130258, 0.27577711]);
  // Match AutoProcessor's float32 rescale, subtraction and division individually.
  // Dynamic quantization can amplify even a one-ULP normalization difference.
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++)
      for (let c = 0; c < 3; c++)
        out[c * size * size + y * size + x] = Math.fround(Math.fround(resized[((y + top) * w + x + left) * 3 + c] / 255) - mean[c]) / std[c];
  return out;
}
export function preprocessCLIP(image) {
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(image, 0, 0);
  return clipResizeNormalize(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
}
