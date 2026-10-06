export function decodeMask(counts, width, height) {
  const mask = new Uint8Array(width * height);
  let offset = 0;
  for (let i = 0; i < counts.length; i++) {
    const end = offset + counts[i];
    if (end > mask.length) throw new Error("Invalid mask RLE.");
    if (i % 2) mask.fill(1, offset, end);
    offset = end;
  }
  if (offset !== mask.length) throw new Error("Incomplete mask RLE.");
  return mask;
}
export function maskLayer(mask, width, height, color, alpha = 0.2) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d"),
    pixels = ctx.createImageData(width, height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (!mask[i]) continue;
      const edge = x === 0 || y === 0 || x === width - 1 || y === height - 1 || !mask[i - 1] || !mask[i + 1] || !mask[i - width] || !mask[i + width];
      pixels.data.set([...color, edge ? 245 : Math.round(alpha * 255)], i * 4);
    }
  ctx.putImageData(pixels, 0, 0);
  return canvas;
}
