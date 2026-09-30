import { C } from "./config.js";
export function makeRaster() {
  const canvas = document.createElement("canvas");
  canvas.width = C.width;
  canvas.height = C.height;
  return canvas;
}
export function renderPaths(canvas, paths, color = "#172e32", width = 3) {
  const ctx = canvas.getContext("2d");
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = ctx.lineJoin = "round";
  ctx.beginPath();
  for (const path of paths) {
    if (!path.length) continue;
    ctx.moveTo(...path[0]);
    for (const p of path.slice(1)) ctx.lineTo(...p);
  }
  ctx.stroke();
}
export function clearRaster(canvas) {
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, C.width, C.height);
}
export class DrawingView {
  constructor(reference, current) {
    this.reference = reference;
    this.current = current;
    this.inkRaster = makeRaster();
    this.inkVersion = -1;
    this.disturbanceVersion = -1;
    this.inkLength = 0;
    clearRaster(this.inkRaster);
  }
  renderReference(strokes) {
    clearRaster(this.reference);
    renderPaths(this.reference, strokes);
  }
  syncInk(ink) {
    if (this.inkVersion === ink.version) return false;
    const rebuild = this.disturbanceVersion !== ink.disturbanceVersion;
    if (rebuild) clearRaster(this.inkRaster);
    renderPaths(
      this.inkRaster,
      ink.segments.slice(rebuild ? 0 : this.inkLength).map((s) => [s.a, s.b])
    );
    this.inkVersion = ink.version;
    this.inkLength = ink.segments.length;
    this.disturbanceVersion = ink.disturbanceVersion;
    return true;
  }
  pixels() {
    return this.inkRaster.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, C.width, C.height).data;
  }
  display(detection, preview, eraser = null) {
    const ctx = this.current.getContext("2d");
    ctx.drawImage(this.inkRaster, 0, 0);
    ctx.fillStyle = "#d8514c";
    for (const { points, missing } of detection?.samples || [])
      for (let i = 0; i < points.length; i += 4)
        if (missing[i]) {
          ctx.beginPath();
          ctx.arc(...points[i], 2.2, 0, Math.PI * 2);
          ctx.fill();
        }
    renderPaths(this.current, preview, "#dcae26", 2);
    ctx.fillStyle = "#dcae26";
    for (const path of preview) for (let i = 0; i < path.length; i += 6) ctx.fillRect(path[i][0] - 3, path[i][1] - 3, 6, 6);
    if (eraser) {
      ctx.beginPath();
      ctx.arc(...eraser.point, eraser.radius, 0, Math.PI * 2);
      ctx.fillStyle = "#db514c22";
      ctx.fill();
      ctx.strokeStyle = "#d8514c";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }
}
