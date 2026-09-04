export class BrowserPolicy {
  constructor(url) {
    this.url = url;
    this.session = null;
    this.inputName = null;
    this.outputName = null;
    this.hidden = new Float32Array(64);
    this.cell = new Float32Array(64);
  }

  async load() {
    if (!window.ort) throw new Error("ONNX Runtime Web did not load");
    window.ort.env.wasm.numThreads = 1;
    window.ort.env.wasm.proxy = false;
    this.session = await window.ort.InferenceSession.create(this.url.toString(), {
      executionProviders: ["wasm"],
      graphOptimizationLevel: "all"
    });
    this.inputName = this.session.inputNames[0];
    this.outputName = this.session.outputNames[0];
  }

  async act(observation) {
    if (!this.session) throw new Error("Policy has not been loaded");
    const input = new window.ort.Tensor("float32", observation, [1, 47]);
    const hidden = new window.ort.Tensor("float32", this.hidden, [1, 1, 64]);
    const cell = new window.ort.Tensor("float32", this.cell, [1, 1, 64]);
    const result = await this.session.run({
      [this.inputName]: input,
      hidden,
      cell
    });
    this.hidden.set(result.next_hidden.data);
    this.cell.set(result.next_cell.data);
    return Float32Array.from(result[this.outputName].data);
  }

  reset() {
    this.hidden.fill(0);
    this.cell.fill(0);
  }
}
