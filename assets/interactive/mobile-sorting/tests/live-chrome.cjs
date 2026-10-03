const { chromium } = require("playwright"),
  assert = require("node:assert/strict"),
  fs = require("node:fs");
(async () => {
  const browser = await chromium.connectOverCDP(process.env.CHROME_CDP || "http://127.0.0.1:9225");
  const page = browser
    .contexts()[0]
    .pages()
    .find((p) => p.url().includes("/assets/interactive/mobile-sorting/"));
  assert.ok(page, "Open the dedicated Chrome preview first");
  await page.bringToFront();
  await page.reload();
  await page.waitForFunction(() => !!window.sorting, { timeout: 60000 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const readings = [];
  for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(5000);
    const x = await page.evaluate(() => ({
      snapshot: window.sorting.snapshot(),
      metrics: { ...window.sorting.metrics },
      quality: window.sorting.renderer.quality,
    }));
    readings.push(x);
    console.log("Live Chrome", x.snapshot.time.toFixed(1), x.snapshot.state, x.snapshot.stats.sorted);
  }
  assert.ok(readings.at(-1).snapshot.stats.sorted >= 1, JSON.stringify(readings.at(-1)));
  assert.deepEqual(errors, []);
  const out = process.env.SORTING_ARTIFACTS || "/tmp/mobile-sorting-browser";
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(out + "/live-chrome.json", JSON.stringify({ browser: browser.version(), readings, errors }, null, 2));
  await page.screenshot({ path: out + "/live-chrome.png" });
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
