const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const origin = process.env.PORTAL_ORIGIN || "http://127.0.0.1:8098";
const out = path.resolve(__dirname, "../results");
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--enable-webgl", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  const results = [];
  for (const [name, width, height, mobile] of [
    ["desktop", 1440, 900, false],
    ["phone-portrait", 412, 915, true],
    ["phone-landscape", 915, 412, true],
  ]) {
    console.log(`Checking ${name}`);
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: mobile, isMobile: mobile });
    const page = await context.newPage();
    const errors = [],
      missing = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    page.on("response", (r) => {
      if (r.status() >= 400) missing.push(r.url());
    });
    await page.goto(`${origin}/portal/`);
    const frame = page.frameLocator("iframe");
    await frame.getByRole("button", { name: "Enter chamber" }).waitFor();
    assert.equal(await frame.locator("canvas").count(), 1);
    // Direct runtime test URL provides read-only inspection to the solver below.
    await page.goto(`${origin}/assets/interactive/portal-puzzle-lab/index.html?debug=1`);
    await page.waitForFunction(() => window.portalLab);
    await page.getByRole("button", { name: "Enter chamber" }).click();
    await page.evaluate(() => document.exitPointerLock?.());
    await page.waitForFunction(() => !document.pointerLockElement);
    await page.waitForTimeout(500);
    const state = () => page.evaluate(() => window.portalLab.state());
    const client = await context.newCDPSession(page);
    if (mobile) {
      const b = await page.locator("#stick").boundingBox(),
        a = await page.locator("#blue").boundingBox();
      await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: b.x + b.width / 2, y: b.y + 18, id: 1 }] });
      await page.waitForTimeout(300);
      assert.ok((await state()).player[2] < 1.75, "real touch joystick must move");
      await client.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [
          { x: b.x + b.width / 2, y: b.y + 18, id: 1 },
          { x: width * 0.7, y: height * 0.4, id: 2 },
        ],
      });
      await client.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [
          { x: b.x + b.width / 2, y: b.y + 18, id: 1 },
          { x: width * 0.7 + 55, y: height * 0.4 - 20, id: 2 },
        ],
      });
      assert.ok(Math.abs((await state()).yaw) > 0.1, "simultaneous look works");
      await client.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [
          { x: b.x + b.width / 2, y: b.y + 18, id: 1 },
          { x: width * 0.7 + 55, y: height * 0.4 - 20, id: 2 },
          { x: a.x + a.width / 2, y: a.y + a.height / 2, id: 3 },
        ],
      });
      await client.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
      assert.deepEqual(await page.evaluate(() => window.portalLab.input.stick), { x: 0, z: 0 });
    }
    await page.getByRole("button", { name: "Restart chamber" }).click();
    await page.evaluate(() => document.exitPointerLock?.());
    await page.waitForFunction(() => !document.pointerLockElement);
    const bounds = await page.locator("button").evaluateAll((bs) =>
      bs
        .filter((b) => b.getBoundingClientRect().width && b.offsetParent !== null)
        .map((b) => {
          const r = b.getBoundingClientRect();
          return { label: b.getAttribute("aria-label") || b.textContent, x: r.x, y: r.y, w: r.width, h: r.height };
        })
    );
    for (const b of bounds) assert.ok(b.x >= 0 && b.y >= 0 && b.x + b.w <= width + 1 && b.y + b.h <= height + 1, `${name} clipped ${b.label}`);
    async function turn(yaw, pitch = 0) {
      if (mobile) {
        for (let i = 0; i < 30; i++) {
          const s = await state(),
            dx = Math.atan2(Math.sin(yaw - s.yaw), Math.cos(yaw - s.yaw)),
            dy = pitch - s.pitch;
          if (Math.abs(dx) < 0.012 && Math.abs(dy) < 0.012) return;
          const x = width * 0.7,
            y = height * 0.42,
            ex = x + Math.max(-width * 0.2, Math.min(width * 0.2, -dx / 0.0035)),
            ey = y + Math.max(-height * 0.2, Math.min(height * 0.2, -dy / 0.0035));
          await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y, id: 7 }] });
          await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: ex, y: ey, id: 7 }] });
          await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        }
        throw Error("Touch look failed");
      }

      for (const [key, desired, positive, negative] of [
        ["yaw", yaw, "ArrowLeft", "ArrowRight"],
        ["pitch", pitch, "ArrowUp", "ArrowDown"],
      ]) {
        for (let i = 0; i < 10; i++) {
          const s = await state();
          let diff = desired - s[key];
          if (key === "yaw") diff = Math.atan2(Math.sin(diff), Math.cos(diff));
          if (Math.abs(diff) < 0.025) break;
          const k = diff > 0 ? positive : negative;
          await page.keyboard.down(k);
          const initial = s[key],
            amount = Math.abs(diff);
          await page.waitForFunction(
            ({ key, initial, amount }) => Math.abs(window.portalLab.state()[key] - initial) >= amount - 0.012,
            { key, initial, amount },
            { timeout: 20000 }
          );
          await page.keyboard.up(k);
        }
      }
    }
    async function moveDown() {
      if (!mobile) {
        await page.keyboard.down("w");
        return;
      }
      const r = await page.locator("#stick").boundingBox();
      await client.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x: r.x + r.width / 2, y: r.y + r.height / 2 - 42, id: 11 }],
      });
    }
    async function moveUp() {
      if (!mobile) {
        await page.keyboard.up("w");
        return;
      }
      await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    }
    async function aim(x, y, z) {
      const s = await state(),
        dx = x - s.player[0],
        dz = z - s.player[2],
        dy = y - (s.player[1] + 0.68);
      await turn(Math.atan2(-dx, -dz), Math.atan2(dy, Math.hypot(dx, dz)));
    }
    async function walkTo(x, z, tolerance = 0.3) {
      for (let attempt = 0; attempt < 25; attempt++) {
        const s = await state(),
          distance = Math.hypot(s.player[0] - x, s.player[2] - z);
        if (distance < tolerance || s.complete) return;
        await aim(x, 1.57, z);
        const initial = (await state()).time,
          duration = Math.min(0.45, Math.max(0.06, (distance - 0.18) / 3.6));
        await moveDown();
        try {
          await page.waitForFunction(
            ({ initial, duration }) => window.portalLab.state().time >= initial + duration || window.portalLab.state().complete,
            { initial, duration },
            { timeout: 15000 }
          );
        } finally {
          await moveUp();
        }
      }
      console.log("failed walk", await state());
      await page.screenshot({ path: path.join(out, name + "-failure.jpg") });
      throw Error("Could not reach waypoint");
    }
    await aim(-3.5, 1.4, -8);
    if (mobile) await page.locator("#blue").tap();
    else {
      await page.locator("canvas").click();
      await page.waitForFunction(() => document.pointerLockElement);
      await aim(-3.5, 1.4, -8);
      await page.mouse.down();
      await page.mouse.up();
    }
    assert.equal((await state()).portals[0]?.panel, "entry", "blue shot must hit entry panel");
    await aim(0, 1.4, -14);
    if (mobile) await page.locator("#orange").tap();
    else {
      await page.mouse.down({ button: "right" });
      await page.mouse.up({ button: "right" });
    }
    assert.equal((await state()).portals[1]?.panel, "vault", "orange shot through observation glass");
    await page.screenshot({ path: path.join(out, `${name}-linked.jpg`), quality: 88, type: "jpeg" });
    // Navigate entirely with normal keyboard controls. No puzzle-state mutations.
    await walkTo(-3.5, -6.7);
    await turn(0, 0);
    await moveDown();
    await page.waitForFunction(() => window.portalLab.state().crossings.player === 1, null, { timeout: 30000 });
    await moveUp();
    await walkTo(0, -12.7);
    await aim(0, 0.45, -11.5);
    if (mobile) await page.locator("#interact").tap();
    else await page.keyboard.press("e");
    assert.ok((await state()).holding);
    await turn(0, 0);
    await moveDown();
    await page.waitForFunction(() => window.portalLab.state().crossings.player === 2, null, { timeout: 30000 });
    await moveUp();
    assert.ok((await state()).holding, "carried cube survives return traversal");
    assert.ok((await state()).crossings.cube >= 1);
    await walkTo(-3.5, -6.6);
    await walkTo(3.6, -1.0, 0.13);
    await turn(Math.PI, -0.73);
    const settling = (await state()).time;
    await page.waitForFunction((t) => window.portalLab.state().time > t + 0.65, settling);
    if (mobile) await page.locator("#interact").tap();
    else await page.keyboard.press("e");
    await page.waitForFunction(() => window.portalLab.state().doorOpen, null, { timeout: 20000 });
    await walkTo(5.1, -1.5);
    await walkTo(5.1, 2.6);
    await walkTo(4.4, 2.9);
    await walkTo(4.4, 5.3, 0.8);
    await page.waitForFunction(() => window.portalLab.state().complete);
    await page.locator("#complete").waitFor({ state: "visible" });
    const solved = await state();
    await page.screenshot({ path: path.join(out, `${name}-complete.jpg`), quality: 88, type: "jpeg" });
    await page.getByRole("button", { name: "Run it again" }).click();
    await page.evaluate(() => document.exitPointerLock?.());
    await page.waitForFunction(() => !document.pointerLockElement);
    const reset = await state();
    assert.deepEqual(reset.portals, [null, null]);
    assert.equal(reset.complete, false);
    assert.equal(reset.holding, false);
    await page.getByRole("button", { name: "Switch to quality graphics" }).click();
    assert.equal((await state()).lowQuality, false);
    await page.getByRole("button", { name: "Switch to fast graphics" }).click();
    assert.equal((await state()).lowQuality, true);
    if (mobile) {
      await page.setViewportSize({ width: height, height: width });
      await page.waitForTimeout(200);
      const resized = await state();
      assert.ok(Math.abs(resized.portalResolution[0] / resized.portalResolution[1] - height / width) < 0.02);
      await page.setViewportSize({ width, height });
    }
    await page.waitForTimeout(1200);
    const performance = await state();
    assert.deepEqual(errors, []);
    assert.deepEqual(missing, []);
    results.push({ name, width, height, mobile, solved, reset, performance, errors, missing, bounds });
    fs.writeFileSync(path.join(out, "browser.json"), JSON.stringify(results, null, 2));
    console.log(`${name}: solved in ${solved.time.toFixed(1)} simulation seconds, ${performance.fps.toFixed(1)} FPS (software GPU)`);
    await context.close();
  }
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
