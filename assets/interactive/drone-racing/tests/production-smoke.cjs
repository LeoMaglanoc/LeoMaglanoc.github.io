const { chromium } = require("playwright");
const assert = require("node:assert/strict");
(async () => {
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const base = process.env.BUILT_URL || "http://drone-built-preview";
  await page.goto(base + "/drone-racing/");
  await page.waitForFunction(() => document.querySelector("iframe")?.contentWindow?.drone?.ready, {}, { timeout: 60000 });
  const frame = page.frames().find((f) => f.url().includes("/assets/interactive/drone-racing/"));
  const result = await frame.evaluate(() => {
    const d = window.drone;
    d.pause(true);
    d.runner.reset(false);
    while (d.runner.time < d.runner.trajectory.duration * 3 + 1) d.runner.step();
    return d.runner.metrics();
  });
  assert.ok(result.lap >= 4);
  assert.equal(result.resets, 0);
  assert.equal(result.collisions, 0);
  assert.deepEqual(errors, []);
  await page.goto(base);
  assert.ok(await page.locator('a[href="/drone-racing/"]').count());
  console.log("Built Jekyll page, iframe assets, full autonomous lap and homepage link passed", result);
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
