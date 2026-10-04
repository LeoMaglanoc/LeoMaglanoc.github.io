const { chromium } = require("playwright");
const fs = require("node:fs");
const assert = require("node:assert/strict");
const url = process.env.SORTING_URL || "http://localhost:8003/assets/interactive/mobile-sorting/";
const artifacts = process.env.SORTING_ARTIFACTS || "/tmp/mobile-sorting-browser";
fs.mkdirSync(artifacts, { recursive: true });
(async () => {
  const browser = process.env.CHROME_CDP
    ? await chromium.connectOverCDP(process.env.CHROME_CDP)
    : await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  console.log("Browser:", browser.version());
  const report = { browser: browser.version(), viewports: [] };
  for (const [name, width, height, touch] of [
    ["desktop", 1440, 900, false],
    ["portrait", 390, 844, true],
    ["landscape", 844, 390, true],
  ]) {
    const context = await browser.newContext({ viewport: { width, height }, isMobile: touch, hasTouch: touch, deviceScaleFactor: touch ? 2 : 1 });
    const page = await context.newPage(),
      errors = [],
      external = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("request", (r) => {
      if (!r.url().startsWith(new URL(url).origin) && !r.url().startsWith("data:")) external.push(r.url());
    });
    await page.goto(url);
    await page.waitForFunction(() => !!window.sorting, { timeout: 60000 });
    await page.locator("#pause").click();
    const initial = await page.evaluate(() => window.sorting.snapshot());
    await page.waitForTimeout(250);
    assert.equal(await page.evaluate(() => window.sorting.snapshot().time), initial.time);
    await page.screenshot({ path: `${artifacts}/${name}.png` });
    const layout = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth > innerWidth,
      buttons: [...document.querySelectorAll("footer button")].map((b) => ({ id: b.id, rect: b.getBoundingClientRect().toJSON() })),
      canvas: document.querySelector("canvas").getBoundingClientRect().toJSON(),
    }));
    assert.equal(layout.overflow, false);
    for (const b of layout.buttons) {
      assert.ok(b.rect.height >= 44);
      assert.ok(b.rect.bottom <= height + 1);
      assert.ok(b.rect.right <= width + 1);
    }
    assert.ok(layout.canvas.height > 120);
    await page.locator("#about").click();
    assert.ok(await page.locator("#explanation").isVisible());
    await page.locator("#close-about").click();
    const before = await page.evaluate(() => window.sorting.renderer.camera.position.toArray());
    const box = await page.locator("#simulation").boundingBox();
    if (touch) {
      const cdp = await context.newCDPSession(page);
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x: box.x + box.width * 0.55, y: box.y + box.height * 0.45 }],
      });
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: box.x + box.width * 0.75, y: box.y + box.height * 0.55 }] });
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    } else {
      await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.45);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * 0.75, box.y + box.height * 0.55, { steps: 10 });
      await page.mouse.up();
    }
    await page.waitForTimeout(200);
    const after = await page.evaluate(() => window.sorting.renderer.camera.position.toArray());
    assert.ok(Math.hypot(...after.map((v, i) => v - before[i])) > 0.05);
    const zoomBefore = await page.evaluate(() => window.sorting.renderer.camera.position.distanceTo(window.sorting.renderer.controls.target));
    if (touch) {
      const cdp = await context.newCDPSession(page),
        x = box.x + box.width * 0.5,
        y = box.y + box.height * 0.45;
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [
          { id: 1, x: x - 30, y },
          { id: 2, x: x + 30, y },
        ],
      });
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [
          { id: 1, x: x - 60, y },
          { id: 2, x: x + 60, y },
        ],
      });
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    } else {
      await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.45);
      await page.mouse.wheel(0, -150);
    }
    await page.waitForTimeout(200);
    assert.ok((await page.evaluate(() => window.sorting.renderer.camera.position.distanceTo(window.sorting.renderer.controls.target))) < zoomBefore);
    await page.locator("#camera").click();
    await page.locator("#debug").click();
    assert.ok(await page.locator("#debug-info").isVisible());
    await page.locator("#debug").click();
    await page.locator("#reset").click();
    assert.equal(await page.evaluate(() => window.sorting.snapshot().stats.sorted), 0);
    await page.locator("#pause").click();
    const startTime = await page.evaluate(() => window.sorting.snapshot().time);
    await page.waitForTimeout(1500);
    const metrics = await page.evaluate(() => ({
      ...window.sorting.metrics,
      time: window.sorting.snapshot().time,
      quality: window.sorting.renderer.quality,
      shadows: window.sorting.renderer.renderer.shadowMap.enabled,
    }));
    assert.ok(metrics.time > startTime + 0.8);
    await page.locator("#pause").click();
    if (name === "desktop" && process.env.SORTING_FULL !== "0") {
      let x;
      for (let i = 0; i < 80; i++) {
        x = await page.evaluate(() => {
          window.sorting.advance(2500);
          return window.sorting.snapshot();
        });
        if (x.stats.sorted >= 3) break;
      }
      assert.ok(x.stats.sorted >= 3, JSON.stringify(x));
      assert.ok(x.stats.blue > 0 && x.stats.red > 0, JSON.stringify(x.stats));
      await page.screenshot({ path: `${artifacts}/desktop-sorting.png` });
      report.sorting = x;
      await page.locator("#reset").click();
      assert.equal(await page.evaluate(() => window.sorting.snapshot().stats.sorted), 0);
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
    report.viewports.push({ name, width, height, layout, metrics, errors, external });
    await context.close();
  }
  fs.writeFileSync(`${artifacts}/results.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
