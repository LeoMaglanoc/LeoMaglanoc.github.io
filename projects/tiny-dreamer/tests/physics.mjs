import { chromium } from "playwright";
import assert from "node:assert/strict";
const browser = await chromium.launch({ args: ["--no-sandbox"] });
try {
  const page = await browser.newPage();
  page.on("pageerror", (error) => console.error(error));
  await page.goto(
    "http://website:4000/projects/tiny-dreamer/tests/physics.html",
  );
  await page.waitForFunction(() => window.ready || window.failure);
  const result = await page.evaluate(async () => {
    if (window.failure) throw new Error(window.failure);
    const sim = window.simulation;
    const trace = await (await fetch("../models/reference_trace.json")).json();
    sim.data.qpos.set(trace.initial_qpos);
    sim.data.qvel.set(trace.initial_qvel);
    sim.mj.mj_forward(sim.model, sim.data);
    const maxima = { qpos: 0, qvel: 0, observation: 0 };
    for (const step of trace.steps) {
      const obs = sim.step(step.action[0]);
      for (const [name, actual] of [
        ["qpos", sim.data.qpos],
        ["qvel", sim.data.qvel],
        ["observation", obs],
      ]) {
        maxima[name] = Math.max(
          maxima[name],
          ...[...actual].map((v, i) => Math.abs(v - step[name][i])),
        );
      }
    }
    return { maxima, version: sim.mj.mj_versionString() };
  });
  console.log(JSON.stringify(result));
  assert.ok(Object.values(result.maxima).every((v) => v < 2e-5));
} finally {
  await browser.close();
}
