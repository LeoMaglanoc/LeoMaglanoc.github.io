const { chromium } = require("playwright");
const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const root = path.resolve(__dirname, ".."),
  out = path.join(root, "results"),
  origin = process.env.SOCCER_ORIGIN || "http://127.0.0.1:8097";
const fixtures = JSON.parse(
    fs.readFileSync(path.join(out, "reference-fixtures.json")),
  ),
  low = JSON.parse(fs.readFileSync(path.join(out, "low-level-fixtures.json")));
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome",
    args: [
      "--no-sandbox",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
    ],
  });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.text().startsWith("evaluation ")) console.log(m.text());
    });
    await page.goto(`${origin}/assets/interactive/g1-soccer/manifest.json`);
    await page.evaluate(() => {
      const worker = new Worker("./src/worker.js", { type: "module" });
      let nextId = 0;
      const pending = new Map();
      window.request = (type, extra = {}) =>
        new Promise((resolve, reject) => {
          const id = ++nextId;
          pending.set(id, { resolve, reject });
          worker.postMessage({ type, id, ...extra });
        });
      worker.onmessage = ({ data: m }) => {
        if (m.type === "reply") {
          pending.get(m.id)?.resolve(m.value);
          pending.delete(m.id);
        }
        if (m.type === "error") {
          pending.get(m.id)?.reject(Error(m.message));
          pending.delete(m.id);
        }
        if (m.type === "evaluation-progress" && m.completed % 10 === 0)
          console.log(`evaluation ${m.completed}/${m.total}`);
      };
    });
    await page.evaluate(() => request("init"));
    const parity = await page.evaluate(
      async ({ high, low }) => request("parity", { high, low }),
      { high: fixtures.flatMap((f) => f.trace), low },
    );
    assert.ok(
      Math.max(...Object.values(parity)) < 1e-5,
      JSON.stringify(parity),
    );
    const evaluation = await page.evaluate(
      async (fixtures) => request("evaluate", { fixtures, trace: true }),
      fixtures,
    );
    const successes = evaluation.results.filter(
      (r) => r.outcome === "success",
    ).length;
    const native = JSON.parse(
      fs.readFileSync(path.join(out, "native-evaluation.json")),
    );
    const comparison = evaluation.results.map((r, i) => ({
      seed: r.seed,
      native: native.results[i].outcome,
      browser: r.outcome,
      seconds_difference: (r.steps - native.results[i].steps) * 0.2,
      final_distance_difference:
        r.final_distance - native.results[i].final_distance,
    }));
    const traces = evaluation.results.slice(0, 3).map((r, i) => {
      const n = fixtures[i].trace[0],
        b = r.trace[0];
      return {
        seed: r.seed,
        first_step_qpos_error: Math.max(
          ...n.qpos.map((v, j) => Math.abs(v - b.qpos[j])),
        ),
        first_step_observation_error: Math.max(
          ...n.obs.map((v, j) => Math.abs(v - b.obs[j])),
        ),
        first_step_action_error: Math.max(
          ...n.action.map((v, j) => Math.abs(v - b.action[j])),
        ),
      };
    });
    const report = {
      browser: browser.version(),
      physics: "MuJoCo 3.10.0 WASM",
      rendering: "Worker-only harness; UI rendering is tested separately",
      acceptance: {
        inference_tolerance: 1e-5,
        first_step_qpos_tolerance: 1e-4,
        max_success_difference_percentage_points: 10,
      },
      parity,
      episodes: evaluation.results.length,
      successes,
      native_successes: native.successes,
      outcome_agreement: comparison.filter((r) => r.native === r.browser)
        .length,
      wall_seconds: evaluation.wall_seconds,
      traces,
      comparison,
      errors,
    };
    fs.writeFileSync(
      path.join(out, "browser-evaluation.json"),
      JSON.stringify(report, null, 2) + "\n",
    );
    fs.writeFileSync(
      path.join(out, "browser-reference-traces.json"),
      JSON.stringify(evaluation.results.slice(0, 3), null, 2) + "\n",
    );
    assert.ok(
      Math.abs(successes - native.successes) <= 10,
      "Browser success differs by more than 10 percentage points",
    );
    assert.ok(
      traces.every((t) => t.first_step_qpos_error < 1e-4),
      "Short trajectory parity failed",
    );
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ ...report, comparison: undefined }, null, 2));
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
