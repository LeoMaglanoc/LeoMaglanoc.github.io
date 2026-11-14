// The only messages carrying observations contain pixel masks. No state/goal poses.
let model,
  planner,
  goalCache = null,
  goalLatent = null,
  initialization = null,
  processing = false,
  latestPlan = null,
  latestError = null;
// Keep at most one pending plan: rapid goal drags cannot grow an inference queue.
self.onmessage = (event) => {
  const m = event.data;
  if (m.type === "init") {
    initialization = handle(m).catch((error) =>
      self.postMessage({
        type: "failure",
        message: "Model initialization failed · " + error.message,
      }),
    );
    return;
  }
  if (m.type === "plan") latestPlan = m;
  else latestError = m;
  drain();
};
async function drain() {
  if (processing) return;
  processing = true;
  await initialization;
  while (latestPlan || latestError) {
    const m = latestPlan || latestError;
    if (latestPlan) latestPlan = null;
    else latestError = null;
    try {
      await handle(m);
    } catch (error) {
      self.postMessage({
        type: "failure",
        message: "Planner failed · " + error.message,
        version: m.version,
      });
    }
  }
  processing = false;
}
async function handle(m) {
  if (m.type === "init") {
    importScripts(
      new URL("../../doom/vendor/ort/ort.min.js", self.location).href,
    );
    const [{ WorldModel }, { CEM }] = await Promise.all([
      import("./model.js?v=2.2"),
      import("./planner.js?v=2.2"),
    ]);
    model = new WorldModel(self.ort, self.location.href);
    await model.init();
    planner = new CEM(model);
    self.postMessage({
      type: "ready",
      label: "Experimental",
      note: model.metadata.note,
      benchmark: model.metadata.benchmark,
    });
  } else if (m.type === "plan") {
    const start = performance.now();
    if (m.reset) planner.reset();
    const state = await model.encode(m.observation);
    if (!goalCache || !m.goal.every((v, i) => v === goalCache[i])) {
      goalCache = Float32Array.from(m.goal);
      goalLatent = await model.goal(goalCache);
      planner.reset();
    }
    const plan = await planner.plan(state, goalLatent, m.compute);
    const all = [plan.latents, ...plan.candidateLatents],
      flat = new Float32Array(all.length * plan.latents.length * 48);
    let offset = 0;
    for (const path of all)
      for (const s of path) {
        flat.set(s, offset);
        offset += 48;
      }
    const decoded = await model.decode(flat, flat.length / 48),
      paths = [];
    let i = 0;
    for (const path of all) {
      const poses = [];
      for (const s of path) {
        const x = decoded[i * 6] * 10,
          y = decoded[i * 6 + 1] * 10;
        poses.push({
          x,
          y,
          angle: Math.atan2(decoded[i * 6 + 2], decoded[i * 6 + 3]),
        });
        i++;
      }
      paths.push(poses);
    }
    self.postMessage({
      type: "plan",
      version: m.version,
      action: plan.action,
      cost: plan.cost,
      predicted: plan.predicted,
      poses: paths[0],
      candidates: paths.slice(1),
      latency: performance.now() - start,
      config: plan.config,
    });
  } else if (m.type === "error") {
    const actual = await model.encode(m.observation);
    let mse = 0;
    for (let i = 0; i < 24; i++) mse += (actual[i] - m.prediction[i]) ** 2;
    self.postMessage({ type: "error", version: m.version, value: mse / 24 });
  }
}
