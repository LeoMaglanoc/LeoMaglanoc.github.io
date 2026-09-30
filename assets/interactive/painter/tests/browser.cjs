// NODE_PATH=/path/to/playwright/node_modules node tests/browser.cjs
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const url = process.env.PAINTER_URL || "http://127.0.0.1:8766/assets/interactive/painter/index.html";
// Accelerate simulated time after exercising real pointer/button gestures.
// Production still bounds physics to 25 steps per animation frame.
async function drainMotion(page) {
  await page.evaluate(async () => {
    const app = window.__painterTest;
    let steps = 0;
    while (["PLANNING_DRAW", "DRAWING", "PLANNING_REPAIR", "REPAIRING"].includes(app.state)) {
      for (let i = 0; i < 1000 && app.executor.active; i++) {
        if (++steps > 150000) throw Error("Execution did not terminate");
        if (app.executor.step()) {
          app.finishMotion();
          break;
        }
      }
      await new Promise((r) => setTimeout(r, 0));
    }
  });
}
const output = process.env.PAINTER_ARTIFACTS || "/tmp/painter-browser";
fs.mkdirSync(output, { recursive: true });
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome",
    headless: true,
    args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  const results = [];
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 360, height: 800 },
    { width: 800, height: 360 },
  ]) {
    const mobile = viewport.width !== 1440;
    const context = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile });
    const page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error" && !m.text().includes("404")) errors.push(m.text());
    });
    await page.goto(url);
    await page.waitForFunction(() => document.querySelector("#status").textContent.startsWith("Ready"), {}, { timeout: 60000 });
    await page.evaluate(async () => {
      window.__painterTest = (await import("./src/main.js")).app;
    });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    const heart = Array.from({ length: 121 }, (_, i) => {
      const t = (2 * Math.PI * i) / 120;
      return [320 + 9 * 16 * Math.sin(t) ** 3, 250 - 9 * (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t))];
    });
    // Genuine mouse/CDP touch gestures exercise Pointer Events and capture.
    const box = await page.locator("#reference").boundingBox();
    if (mobile) {
      const cdp = await context.newCDPSession(page);
      for (let i = 0; i < heart.length; i++)
        await cdp.send("Input.dispatchTouchEvent", {
          type: i === 0 ? "touchStart" : i === heart.length - 1 ? "touchEnd" : "touchMove",
          touchPoints: i === heart.length - 1 ? [] : [{ x: box.x + (heart[i][0] / 640) * box.width, y: box.y + (heart[i][1] / 512) * box.height }],
        });
    } else {
      await page.mouse.move(box.x + (heart[0][0] / 640) * box.width, box.y + (heart[0][1] / 512) * box.height);
      await page.mouse.down();
      for (const p of heart) await page.mouse.move(box.x + (p[0] / 640) * box.width, box.y + (p[1] / 512) * box.height);
      await page.mouse.up();
    }
    await page.locator("#paint").click();
    await drainMotion(page);
    await page.waitForFunction(() => ["COMPLETE", "ERROR"].includes(window.__painterTest.state), {}, { timeout: 90000 });
    const initial = await page.evaluate(async () => {
      const { app } = await import("./src/main.js");
      return { missing: app.detection.missingPercent, state: app.state, count: app.ink.segments.length };
    });
    assert.equal(initial.state, "COMPLETE");
    assert.ok(initial.missing < 1, JSON.stringify(initial));
    assert.ok(initial.count > 50);
    async function erase(point) {
      // Scroll eraser panel into view on portrait, then recalculate geometry.
      await page.locator("#current").evaluate((el) => el.scrollIntoView({ block: "center" }));
      await page.evaluate(() => new Promise(requestAnimationFrame));
      const b = await page.locator("#current").boundingBox();
      if (mobile) {
        const cdp = await context.newCDPSession(page);
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchStart",
          touchPoints: [{ x: b.x + (point[0] / 640) * b.width, y: b.y + (point[1] / 512) * b.height }],
        });
        await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      } else {
        await page.mouse.click(b.x + (point[0] / 640) * b.width, b.y + (point[1] / 512) * b.height);
      }
    }
    const textureVersion = await page.evaluate(() => window.__painterTest.renderer.inkTexture.version);
    await erase(heart[30]);
    assert.equal(await page.evaluate(() => window.__painterTest.renderer.inkTexture.image === window.__painterTest.view.inkRaster), true);
    assert.ok((await page.evaluate(() => window.__painterTest.renderer.inkTexture.version)) > textureVersion);
    const damaged = await page.evaluate(async () => {
      const { app } = await import("./src/main.js");
      return app.detection.missingPercent;
    });
    assert.ok(damaged > 2);
    await page.screenshot({ path: `${output}/damage-${viewport.width}.png`, fullPage: true });
    await page.locator("#repair").click();
    assert.ok((await page.evaluate(() => window.__painterTest.preview.length)) > 0);
    await drainMotion(page);
    await page.waitForFunction(() => ["COMPLETE", "REPAIR_STALLED", "ERROR"].includes(window.__painterTest.state), {}, { timeout: 90000 });
    const repaired = await page.evaluate(async () => {
      const { app } = await import("./src/main.js");
      return { missing: app.detection.missingPercent, state: app.state };
    });
    assert.ok(repaired.missing < 1, JSON.stringify(repaired));
    await page.screenshot({ path: `${output}/repaired-${viewport.width}.png`, fullPage: true });
    // Auto countdown and live damage invalidation of an active repair.
    await page.locator("#auto").click();
    await erase(heart[30]);
    await page.waitForFunction(() => window.__painterTest.state === "REPAIRING", {}, { timeout: 30000 });
    const token = await page.evaluate(async () => {
      const { app } = await import("./src/main.js");
      return app.token;
    });
    await erase(heart[80]);
    const interrupted = await page.evaluate(async () => {
      const { app } = await import("./src/main.js");
      return { token: app.token, active: app.executor.active, state: app.state };
    });
    assert.ok(interrupted.token > token);
    assert.equal(interrupted.active, false);
    assert.equal(interrupted.state, "REPAIR_COUNTDOWN");
    await page.waitForFunction(() => window.__painterTest.state === "REPAIRING", {}, { timeout: 30000 });
    await drainMotion(page);
    await page.waitForFunction(() => ["COMPLETE", "REPAIR_STALLED", "ERROR"].includes(window.__painterTest.state), {}, { timeout: 90000 });
    const auto = await page.evaluate(async () => {
      const { app } = await import("./src/main.js");
      return { missing: app.detection.missingPercent, state: app.state, token: app.token };
    });
    assert.equal(auto.state, "COMPLETE");
    assert.equal(auto.missing, 0);
    assert.ok(auto.token > interrupted.token);
    assert.ok(auto.missing < 1, JSON.stringify(auto));
    // Reset during execution cancels the plan and clears physical ink.
    await page.locator("#paint").click();
    await page.waitForFunction(() => window.__painterTest.state === "DRAWING");
    await page.locator("#reset").click();
    assert.deepEqual(
      await page.evaluate(async () => {
        const { app } = await import("./src/main.js");
        return [app.state, app.strokes.length, app.ink.segments.length, app.executor.active];
      }),
      ["READY", 0, 0, false]
    );
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.deepEqual(errors, []);
    results.push({ viewport, initial, damaged, repaired, auto });
    console.log(JSON.stringify(results.at(-1)));
    await context.close();
  }
  await browser.close();
  fs.writeFileSync(`${output}/results.json`, JSON.stringify(results, null, 2));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
