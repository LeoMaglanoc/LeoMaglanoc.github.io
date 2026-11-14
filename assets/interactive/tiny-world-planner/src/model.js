// This module has no simulator imports. It accepts pixels-derived masks only.
export class WorldModel {
  constructor(ort, base) {
    this.ort = ort;
    this.base = base;
  }
  async init() {
    const o = this.ort;
    o.env.wasm.numThreads = 1;
    o.env.wasm.proxy = false;
    o.env.wasm.wasmPaths = new URL("../../doom/vendor/ort/", this.base).href;
    this.metadata = await (
      await fetch(new URL("../models/model_metadata.json", this.base), {
        cache: "no-store",
      })
    ).json();
    for (const n of [
      "object_encoder",
      "agent_encoder",
      "latent_dynamics",
      "diagnostic_decoder",
    ])
      this[n] = await o.InferenceSession.create(
        new URL(
          `../models/${n}.onnx?v=${encodeURIComponent(this.metadata.models?.[n]?.sha256 || this.metadata.version)}`,
          this.base,
        ).href,
        { executionProviders: ["wasm"] },
      );
  }
  async run(name, inputs) {
    const feeds = {};
    for (const [key, { data, shape }] of Object.entries(inputs))
      feeds[key] = new this.ort.Tensor("float32", data, shape);
    let outputs;
    try {
      outputs = await this[name].run(feeds);
      const data = Float32Array.from(Object.values(outputs)[0].data);
      if (!data.every(Number.isFinite))
        throw Error("Non-finite neural prediction");
      return data;
    } finally {
      Object.values(feeds).forEach((t) => t.dispose());
      if (outputs) Object.values(outputs).forEach((t) => t.dispose());
    }
  }
  async encode(observation) {
    const obj = new Float32Array(8192),
      agent = new Float32Array(8192);
    obj.set(observation.object);
    obj.set(observation.previousObject, 4096);
    agent.set(observation.agent);
    agent.set(observation.previousAgent, 4096);
    const o = await this.run("object_encoder", {
        image: { data: obj, shape: [2, 1, 64, 64] },
      }),
      a = await this.run("agent_encoder", {
        image: { data: agent, shape: [2, 1, 64, 64] },
      }),
      state = new Float32Array(48);
    state.set(o.subarray(0, 16));
    state.set(a.subarray(0, 8), 16);
    state.set(o.subarray(16), 24);
    state.set(a.subarray(8), 40);
    return state;
  }
  async goal(mask) {
    return this.run("object_encoder", {
      image: { data: mask, shape: [1, 1, 64, 64] },
    });
  }
  async predict(state, action, batch) {
    return this.run("latent_dynamics", {
      state: { data: state, shape: [batch, 48] },
      action: { data: action, shape: [batch, 2] },
    });
  }
  async decode(states, batch) {
    return this.run("diagnostic_decoder", {
      state: { data: states, shape: [batch, 48] },
    });
  }
}
