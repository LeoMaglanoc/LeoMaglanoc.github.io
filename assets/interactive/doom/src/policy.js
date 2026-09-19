const ACTIONS = [
  ["forward"], ["backward"], ["turnLeft"], ["turnLeft", "forward"], ["turnLeft", "backward"], ["turnRight"], ["turnRight", "forward"], ["turnRight", "backward"], ["attack"], ["attack", "forward"], ["attack", "backward"], ["attack", "turnLeft"], ["attack", "turnLeft", "forward"], ["attack", "turnLeft", "backward"], ["attack", "turnRight"], ["attack", "turnRight", "forward"], ["attack", "turnRight", "backward"], ["strafeLeft"], ["strafeLeft", "forward"], ["strafeLeft", "backward"], ["strafeLeft", "turnLeft"], ["strafeLeft", "turnLeft", "forward"], ["strafeLeft", "turnLeft", "backward"], ["strafeLeft", "turnRight"], ["strafeLeft", "turnRight", "forward"], ["strafeLeft", "turnRight", "backward"], ["strafeRight"], ["strafeRight", "forward"], ["strafeRight", "backward"], ["strafeRight", "turnLeft"], ["strafeRight", "turnLeft", "forward"], ["strafeRight", "turnLeft", "backward"], ["strafeRight", "turnRight"], ["strafeRight", "turnRight", "forward"], ["strafeRight", "turnRight", "backward"]
];

function resizeArea(source, sourceWidth, sourceHeight, targetWidth = 108, targetHeight = 60) {
  const result = new Float32Array(3 * targetWidth * targetHeight);
  for (let ty = 0; ty < targetHeight; ty++) {
    const y0 = ty * sourceHeight / targetHeight, y1 = (ty + 1) * sourceHeight / targetHeight;
    for (let tx = 0; tx < targetWidth; tx++) {
      const x0 = tx * sourceWidth / targetWidth, x1 = (tx + 1) * sourceWidth / targetWidth;
      const rgb = [0, 0, 0];
      for (let sy = Math.floor(y0); sy < Math.ceil(y1); sy++) for (let sx = Math.floor(x0); sx < Math.ceil(x1); sx++) {
        const overlap = Math.max(0, Math.min(x1, sx + 1) - Math.max(x0, sx)) * Math.max(0, Math.min(y1, sy + 1) - Math.max(y0, sy));
        const index = (sy * sourceWidth + sx) * 3;
        rgb[0] += source[index] * overlap; rgb[1] += source[index + 1] * overlap; rgb[2] += source[index + 2] * overlap;
      }
      const area = (x1 - x0) * (y1 - y0), pixel = ty * targetWidth + tx;
      result[pixel] = rgb[0] / area; result[targetWidth * targetHeight + pixel] = rgb[1] / area; result[2 * targetWidth * targetHeight + pixel] = rgb[2] / area;
    }
  }
  return result;
}

export class ArnoldPolicy {
  constructor(url) { this.url = url; this.session = null; this.hidden = new Float32Array(512); this.cell = new Float32Array(512); }
  async load() {
    if (!window.ort) throw new Error("ONNX Runtime Web did not load");
    window.ort.env.wasm.numThreads = 1;
    window.ort.env.wasm.wasmPaths = new URL("../vendor/ort/", import.meta.url).toString();
    this.session = await window.ort.InferenceSession.create(this.url.toString(), { executionProviders: ["wasm"], graphOptimizationLevel: "all" });
  }
  reset() { this.hidden.fill(0); this.cell.fill(0); }
  async act(rgb, width, height, health, ammo) {
    const observation = resizeArea(rgb, width, height);
    const tensor = new window.ort.Tensor("float32", observation, [1, 1, 3, 60, 108]);
    const scalar = (value) => new window.ort.Tensor("float32", Float32Array.of(Math.max(0, value)), [1, 1]);
    const recurrent = (value) => new window.ort.Tensor("float32", value, [1, 1, 512]);
    const output = await this.session.run({ observation: tensor, health: scalar(Math.min(100, health)), selected_ammo: scalar(Math.min(300, ammo)), hidden_in: recurrent(this.hidden), cell_in: recurrent(this.cell) });
    this.hidden.set(output.hidden_out.data); this.cell.set(output.cell_out.data);
    const q = Float32Array.from(output.q_values.data); let action = 0;
    for (let index = 1; index < q.length; index++) if (q[index] > q[action]) action = index;
    return { action, q, controls: ACTIONS[action] };
  }
}

export { ACTIONS };
