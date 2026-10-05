// Match training/train.py: RGB, half-pixel bilinear, no antialiasing, NCHW.
export function resizeNormalize(rgba, width, height, size = 224) {
  const out = new Float32Array(3 * size * size),
    mean = [0.485, 0.456, 0.406],
    std = [0.229, 0.224, 0.225];
  for (let y = 0; y < size; y++) {
    const sy = Math.max(0, Math.min(height - 1, ((y + 0.5) * height) / size - 0.5)),
      y0 = Math.floor(sy),
      y1 = Math.min(y0 + 1, height - 1),
      wy = sy - y0;
    for (let x = 0; x < size; x++) {
      const sx = Math.max(0, Math.min(width - 1, ((x + 0.5) * width) / size - 0.5)),
        x0 = Math.floor(sx),
        x1 = Math.min(x0 + 1, width - 1),
        wx = sx - x0;
      for (let c = 0; c < 3; c++) {
        const a = rgba[(y0 * width + x0) * 4 + c] * (1 - wx) + rgba[(y0 * width + x1) * 4 + c] * wx,
          b = rgba[(y1 * width + x0) * 4 + c] * (1 - wx) + rgba[(y1 * width + x1) * 4 + c] * wx;
        out[c * size * size + y * size + x] = ((a * (1 - wy) + b * wy) / 255 - mean[c]) / std[c];
      }
    }
  }
  return out;
}
export function preprocess(image) {
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(image, 0, 0);
  return resizeNormalize(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
}
