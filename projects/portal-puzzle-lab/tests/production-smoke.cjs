const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const origin = process.env.PORTAL_ORIGIN || "http://127.0.0.1:8098",
  output = path.resolve(__dirname, "../results");
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  const results = [];
  for (const [name, width, height, mobile] of [
    ["desktop", 1440, 900, false],
    ["phone-portrait", 412, 915, true],
    ["phone-landscape", 915, 412, true],
  ]) {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: mobile, isMobile: mobile });
    const page = await context.newPage(),
      errors = [],
      missing = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    page.on("response", (r) => {
      if (r.status() >= 400) missing.push(r.url());
    });
    await page.goto(origin + "/portal/");
    const f = page.frames().find((f) => f.url().includes("/assets/interactive/portal-puzzle-lab/"));
    assert.ok(f);
    await f.waitForFunction(() => document.querySelector("#prompt").textContent !== "Loading chamber…");
    assert.equal(await f.evaluate(() => typeof window.portalLab), "undefined", "public route must not expose debug mutation API");
    const bounds = await f.locator("#start").boundingBox();
    assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= height, "intro button must fit");
    await page.screenshot({ path: path.join(output, name + "-intro.jpg"), type: "jpeg", quality: 88 });
    await f.getByRole("button", { name: "Enter chamber" }).click();
    if (mobile) await f.locator("#blue").tap();
    else {
      await f.waitForFunction(() => document.pointerLockElement);
      await page.mouse.down();
      await page.mouse.up();
    }
    await f.waitForFunction(() => document.querySelector("#blueStatus").classList.contains("active"));
    if (mobile) {
      const client = await context.newCDPSession(page),
        x = width * 0.7,
        y = height * 0.4;
      await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y, id: 1 }] });
      await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x - 98, y, id: 1 }] });
      await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await f.locator("#orange").tap();
      await f.waitForFunction(() => document.querySelector("#orangeStatus").classList.contains("active"));
    }
    await f.evaluate(() => document.exitPointerLock?.());
    await f.waitForFunction(() => !document.pointerLockElement);
    for (let i = 0; i < 2; i++) {
      const before = await f.locator("#quality").textContent();
      await f.locator("#quality").click();
      await f.waitForFunction((before) => document.querySelector("#quality").textContent !== before, before);
    }
    await f.getByRole("button", { name: "Show controls" }).click();
    await f.locator("#overlay").waitFor({ state: "visible" });
    const pausedTimer = await f.locator("#timer").textContent();
    await page.waitForTimeout(150);
    assert.equal(await f.locator("#timer").textContent(), pausedTimer);
    const resume = await f.locator("#start").boundingBox();
    assert.ok(resume.y >= 0 && resume.y + resume.height <= height, "help button must fit");
    await page.reload();
    await page.frameLocator("iframe").getByRole("button", { name: "Enter chamber" }).waitFor();
    assert.deepEqual(errors, []);
    assert.deepEqual(missing, []);
    results.push({ name, width, height, mobile, introBounds: bounds, helpBounds: resume, errors, missing });
    console.log(name + ": production route, portal input, graphics, help and refresh passed");
    await context.close();
  }
  fs.writeFileSync(path.join(output, "production-smoke.json"), JSON.stringify(results, null, 2));
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
