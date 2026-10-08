export class BrowserPolicy {
  constructor(url) {
    this.url = url;
    this.session = null;
    this.inputName = null;
    this.outputName = null;
    this.hidden = new Float32Array(64);
    this.cell = new Float32Array(64);
    this.runToken = 0;
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
    const token = this.runToken;
    const input = new window.ort.Tensor("float32", observation, [1, 47]);
    // Reset must not mutate buffers that an in-flight inference is reading.
    const hidden = new window.ort.Tensor("float32", this.hidden.slice(), [1, 1, 64]);
    const cell = new window.ort.Tensor("float32", this.cell.slice(), [1, 1, 64]);
    let result;
    try {
      result = await this.session.run({ [this.inputName]: input, hidden, cell });
      const action = Float32Array.from(result[this.outputName].data);
      if (action.length !== 12 || !action.every(Number.isFinite)) {
        throw new Error("The locomotion policy returned invalid joint targets");
      }
      if (token === this.runToken) {
        this.hidden.set(result.next_hidden.data);
        this.cell.set(result.next_cell.data);
      }
      return action;
    } finally {
      input.dispose();
      hidden.dispose();
      cell.dispose();
      for (const tensor of Object.values(result || {})) tensor.dispose();
    }
  }

  reset() {
    this.runToken += 1;
    this.hidden.fill(0);
    this.cell.fill(0);
  }
}
