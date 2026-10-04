import { chromium } from "playwright";
import assert from "node:assert/strict";
const browser = await chromium.launch({ args: ["--no-sandbox"] });
try {
  const page = await browser.newPage();
  page.on("console", (msg) => console.log(msg.text()));
  await page.goto(
    "http://website:4000/projects/tiny-dreamer/tests/policy.html",
  );
  await page.waitForFunction(
    () => window.ready || window.failure,
    {},
    { timeout: 60000 },
  );
  const result = await page.evaluate(async () => {
    if (window.failure) throw new Error(window.failure);
    for (let i = 0; i < 30; i++) await window.runner.step();
    return {
      time: window.runner.sim.time,
      action: window.runner.sim.action,
      obs: [...window.runner.sim.observation],
      dream: window.runner.dream.length,
      error: window.runner.error,
    };
  });
  assert.equal(result.time, 1.5);
  assert.equal(result.dream, 15);
  console.log(result);
} finally {
  await browser.close();
}
