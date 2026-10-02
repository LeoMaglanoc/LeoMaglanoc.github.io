import { loadJSON } from "./simulation.js";

export class Policy {
  async init() {
    if (!window.ort) throw new Error("ONNX Runtime could not be loaded");
    this.metadata = await loadJSON(
      new URL("../models/model_metadata.json", import.meta.url),
    );
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.proxy = false;
    // Reuse the site's vendored runtime, with no CDN or network API at runtime.
    ort.env.wasm.wasmPaths = new URL(
      "../../doom/vendor/ort/",
      import.meta.url,
    ).href;
    for (const name of ["posterior", "rssm", "actor"]) {
      this[name] = await ort.InferenceSession.create(
        new URL(`../models/${name}.onnx`, import.meta.url).href,
        { executionProviders: ["wasm"] },
      );
    }
  }

  initial() {
    const c = this.metadata.architecture;
    return {
      h: new Float32Array(c.hidden),
      z: new Float32Array(c.stoch * c.classes),
    };
  }

  feeds(state) {
    const c = this.metadata.architecture;
    return {
      h: new ort.Tensor("float32", state.h, [1, c.hidden]),
      z: new ort.Tensor("float32", state.z, [1, c.stoch, c.classes]),
    };
  }

  async run(session, feeds) {
    try {
      return await session.run(feeds);
    } finally {
      Object.values(feeds).forEach((t) => t.dispose());
    }
  }

  async observe(state, action, observation) {
    const out = await this.run(this.posterior, {
      ...this.feeds(state),
      action: new ort.Tensor("float32", Float32Array.of(action), [1, 1]),
      observation: new ort.Tensor("float32", observation, [1, 5]),
    });
    const result = {
      h: Float32Array.from(out.next_h.data),
      z: Float32Array.from(out.next_z.data),
    };
    Object.values(out).forEach((t) => t.dispose());
    return result;
  }

  async act(state) {
    const out = await this.run(this.actor, this.feeds(state));
    const action = out.action.data[0];
    Object.values(out).forEach((t) => t.dispose());
    if (!Number.isFinite(action) || Math.abs(action) > 1.00001)
      throw new Error("Invalid actor output");
    return action;
  }

  async imagine(state, action) {
    const out = await this.run(this.rssm, {
      ...this.feeds(state),
      action: new ort.Tensor("float32", Float32Array.of(action), [1, 1]),
    });
    const result = {
      state: {
        h: Float32Array.from(out.next_h.data),
        z: Float32Array.from(out.next_z.data),
      },
      observation: Float32Array.from(out.decoded.data),
      reward: out.reward.data[0],
    };
    Object.values(out).forEach((t) => t.dispose());
    return result;
  }
}
