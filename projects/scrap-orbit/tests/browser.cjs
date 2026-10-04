const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const url = process.env.GAME_URL || "http://127.0.0.1:8095/assets/interactive/scrap-orbit/index.html?seed=1701";
(async () => {
  fs.mkdirSync("artifacts/browser", { recursive: true });
  const results = {};
  for (const profile of ["desktop", "touch"]) {
    const browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
    });
    const touch = profile === "touch";
    const context = await browser.newContext({
      viewport: touch ? { width: 390, height: 844 } : { width: 1100, height: 900 },
      hasTouch: touch,
      isMobile: touch,
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error" && !m.text().includes("favicon")) errors.push(m.text());
    });
    await page.goto(url);
    await page.locator("#start").click();
    await page.waitForFunction(() => window.scrapOrbitState?.mode === "menu", null, { timeout: 60000 });
    const state = () => page.evaluate(() => window.scrapOrbitState);
    const point = async (x, y) => {
      const box = await page.locator("canvas").boundingBox();
      return { x: box.x + (x / 450) * box.width, y: box.y + (y / 800) * box.height };
    };
    const click = async (x, y) => {
      const p = await point(x, y);
      if (touch) await page.touchscreen.tap(p.x, p.y);
      else await page.mouse.click(p.x, p.y);
    };
    await click(225, 475);
    await page.waitForFunction(() => window.scrapOrbitState?.mode === "playing");
    const gesture = async (pull, cancel = false) => {
      const initial = await state(),
        a = await point(...initial.ship),
        b = await point(initial.ship[0] + pull[0], initial.ship[1] + pull[1]);
      if (touch) {
        const cdp = await context.newCDPSession(page);
        const tp = (p) => ({ id: 0, x: p.x, y: p.y, radiusX: 2, radiusY: 2, force: 1 });
        await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [tp(a)] });
        await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [tp(b)] });
        await page.waitForFunction(() => window.scrapOrbitState.state === "AIMING" && window.scrapOrbitState.prediction_count > 1);
        const aiming = await state();
        assert.equal(aiming.state, "AIMING");
        if (pull[1] > 0) await page.screenshot({ path: `artifacts/browser/${profile}-aim.png` });
        if (cancel === "resize") await page.setViewportSize({ width: 844, height: 390 });
        await cdp.send("Input.dispatchTouchEvent", { type: cancel === true ? "touchCancel" : "touchEnd", touchPoints: [] });
        await cdp.detach();
      } else {
        await page.mouse.move(a.x, a.y);
        await page.mouse.down();
        await page.mouse.move(b.x, b.y, { steps: 8 });
        await page.waitForFunction(() => window.scrapOrbitState.state === "AIMING" && window.scrapOrbitState.prediction_count > 1);
        if (pull[1] > 0) await page.screenshot({ path: `artifacts/browser/${profile}-aim.png` });
        if (cancel === "resize") await page.setViewportSize({ width: 1000, height: 750 });
        else if (cancel) await page.keyboard.press("Escape");
        await page.mouse.up();
      }
      if (cancel) {
        await page.waitForFunction(() => window.scrapOrbitState.state === "DOCKED");
        assert.equal((await state()).launches, initial.launches, "cancel must not launch");
        if (cancel === "resize") await page.setViewportSize(touch ? { width: 390, height: 844 } : { width: 1100, height: 900 });
        if ((await state()).paused) {
          await page.keyboard.press("Escape");
          await page.waitForFunction(() => !window.scrapOrbitState.paused);
        }
      } else await page.waitForFunction((n) => window.scrapOrbitState.launches > n, initial.launches);
    };
    await gesture([49.52381, 68.57143], true);
    await gesture([49.52381, 68.57143], "resize");
    await gesture([49.52381, 68.57143]);
    await page.waitForFunction(() => window.scrapOrbitState.landings >= 1 && window.scrapOrbitState.state === "DOCKED", null, { timeout: 45000 });
    assert.equal((await state()).shields, 3);
    assert((await state()).score > 0);
    await page.screenshot({ path: `artifacts/browser/${profile}-landing.png` });
    // Pause/restart through real UI, no pose or gameplay mutation endpoint.
    await click(375, 786);
    await page.waitForFunction(() => window.scrapOrbitState.paused);
    await click(225, 491);
    await page.waitForFunction(() => !window.scrapOrbitState.paused && window.scrapOrbitState.score === 0);
    await gesture([-4.517562, 64.60415]);
    await page.waitForFunction(() => window.scrapOrbitState.mode === "upgrade", null, { timeout: 45000 });
    const complete = await state();
    assert.equal(complete.gates, 1);
    assert(complete.score >= 50);
    await page.screenshot({ path: `artifacts/browser/${profile}-upgrade.png` });
    await click(225, 402);
    await page.waitForFunction(() => window.scrapOrbitState.sector === 2 && window.scrapOrbitState.state === "DOCKED");
    assert.equal((await state()).score, complete.score);
    const box = await page.locator("canvas").boundingBox();
    const view = page.viewportSize();
    assert(
      box.x >= -1 && box.y >= -1 && box.x + box.width <= view.width + 1 && box.y + box.height <= view.height + 1,
      "portrait canvas fits viewport"
    );
    if (touch) {
      await page.setViewportSize({ width: 844, height: 390 });
      const landscape = await page.locator("canvas").boundingBox();
      assert(landscape.height <= 390 && landscape.width <= 844);
      await page.screenshot({ path: "artifacts/browser/touch-landscape.png" });
      await page.setViewportSize({ width: 390, height: 844 });
    }
    for (let remaining = 2; remaining >= 0; remaining--) {
      await gesture([0, -120]);
      await page.waitForFunction(
        (n) => window.scrapOrbitState.shields === n && (window.scrapOrbitState.state === "DOCKED" || window.scrapOrbitState.mode === "over"),
        remaining
      );
    }
    assert.equal((await state()).mode, "over");
    await page.screenshot({ path: `artifacts/browser/${profile}-game-over.png` });
    await click(225, 496);
    await page.waitForFunction(
      () => window.scrapOrbitState.mode === "playing" && window.scrapOrbitState.shields === 3 && window.scrapOrbitState.score === 0
    );
    assert((await state()).best >= complete.score, "best score survives retry");
    assert.equal(errors.length, 0, errors.join("\n"));
    results[profile] = {
      cancel: true,
      launch: true,
      salvage: true,
      landing: true,
      relay: true,
      upgrades: true,
      layout: true,
      resizeCancel: true,
      gameOver: true,
      retry: true,
      highScore: true,
      errors,
    };
    fs.writeFileSync("artifacts/browser/results.json", JSON.stringify(results, null, 2));
    console.log("Passed " + profile);
    await browser.close();
  }
  fs.writeFileSync("artifacts/browser/results.json", JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
