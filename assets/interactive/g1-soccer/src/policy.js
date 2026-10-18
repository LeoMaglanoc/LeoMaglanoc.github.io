import * as ort from "../ort.js";
export class Policies {
  async load() {
    const options = {
      executionProviders: ["wasm"],
      graphOptimizationLevel: "all",
    };
    [this.coach, this.walker] = await Promise.all(
      ["coach", "walker"].map((n) =>
        ort.InferenceSession.create(
          new URL(`../models/${n}.onnx`, import.meta.url).href,
          options,
        ),
      ),
    );
    this.reset();
  }
  reset() {
    this.hidden = new Float32Array(64);
    this.cell = new Float32Array(64);
  }
  async run(session, feeds) {
    let result;
    try {
      result = await session.run(feeds);
      return Object.fromEntries(
        Object.entries(result).map(([k, v]) => [k, Float32Array.from(v.data)]),
      );
    } finally {
      for (const t of Object.values(feeds)) t.dispose();
      for (const t of Object.values(result || {})) t.dispose();
    }
  }
  async high(obs) {
    return (
      await this.run(this.coach, {
        obs: new ort.Tensor("float32", obs, [1, 13]),
      })
    ).action;
  }
  async low(obs) {
    const r = await this.run(this.walker, {
      obs: new ort.Tensor("float32", obs, [1, 47]),
      hidden: new ort.Tensor("float32", this.hidden, [1, 1, 64]),
      cell: new ort.Tensor("float32", this.cell, [1, 1, 64]),
    });
    this.hidden = r.next_hidden;
    this.cell = r.next_cell;
    return r.action;
  }
}
