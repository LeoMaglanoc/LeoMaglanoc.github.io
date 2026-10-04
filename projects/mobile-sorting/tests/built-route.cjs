const { chromium } = require("playwright"),
  assert = require("node:assert/strict"),
  fs = require("node:fs");
(async () => {
  const browser = process.env.CHROME_CDP
    ? await chromium.connectOverCDP(process.env.CHROME_CDP)
    : await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const root = process.env.SORTING_BUILT_URL || "http://sorting-built-site:8004",
    out = process.env.SORTING_ARTIFACTS || "/tmp/mobile-sorting-browser";
  fs.mkdirSync(out, { recursive: true });
  const results = [];
  for (const [width, height] of [
    [1440, 900],
    [390, 844],
  ]) {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: width < 600, isMobile: width < 600 }),
      page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(root + "/mobile-sorting/");
    const frame = await (await page.locator("iframe").elementHandle()).contentFrame();
    await frame.waitForFunction(() => !!window.sorting, { timeout: 60000 });
    await frame.locator("#pause").click();
    const bounds = await page.locator("iframe").boundingBox();
    assert.equal(bounds.width, width);
    assert.equal(bounds.height, height);
    assert.equal(await frame.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    if (width > 600) {
      await frame.locator("#fullscreen").click();
      await frame.waitForFunction(() => !!document.fullscreenElement);
      await frame.evaluate(() => document.exitFullscreen());
      await frame.evaluate(() => window.sorting.advance(55000));
      assert.ok((await frame.evaluate(() => window.sorting.snapshot().stats.sorted)) >= 3);
    }
    await page.screenshot({ path: `${out}/built-${width}.png` });
    assert.deepEqual(errors, []);
    results.push({ width, height, errors, sorted: await frame.evaluate(() => window.sorting.snapshot().stats.sorted) });
    await context.close();
  }
  const report = { browser: browser.version(), results };
  fs.writeFileSync(out + "/built-route.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
