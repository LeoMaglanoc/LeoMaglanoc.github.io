const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
(async () => {
  fs.mkdirSync("artifacts", { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  const reports = {};
  for (const mobile of [false, true]) {
    const context = await browser.newContext({
      viewport: mobile ? { width: 412, height: 915 } : { width: 1440, height: 900 },
      deviceScaleFactor: mobile ? 2 : 1,
      isMobile: mobile,
      hasTouch: mobile,
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (e) => {
      if (e.type() === "error") errors.push(e.text());
    });
    await page.goto(process.env.DRONE_URL);
    await page.waitForFunction(() => window.drone?.ready, {}, { timeout: 60000 });
    await page.evaluate(() => window.drone.pause(true));
    const rollouts = await page.evaluate(() => {
      const { runner: r } = window.drone,
        results = {};
      for (const disturbance of ["nominal", "impulse", "wind", "mass", "motor"]) {
        r.reset(false);
        let applied = false;
        while (r.time < r.trajectory.duration * 3 + 1) {
          if (!applied && r.time >= r.trajectory.duration + 4) {
            if (disturbance !== "nominal") r.disturb(disturbance);
            applied = true;
          }
          r.step();
        }
        results[disturbance] = r.metrics();
      }
      r.reset(false);
      while (r.time < r.trajectory.duration * 21 + 1) r.step();
      if (r.race.lap < 21 || r.race.collisions || r.resets) throw Error("continuous 20-lap run failed");
      results.endurance = r.metrics();
      r.reset(false);
      return results;
    });
    for (const [name, result] of Object.entries(rollouts)) {
      assert.ok(result.lap >= 4, name);
      assert.equal(result.collisions, 0, name);
      assert.equal(result.resets, 0, name);
      assert.ok(result.maxTrackingError < 1, name);
      assert.ok(result.mpc.average > 0 && result.mpc.p95 > 0);
    }
    await page.locator('[data-mode="FLY"]').click();
    await page.evaluate(() => window.drone.pause(true));
    await page.evaluate(() => {
      window.drone.renderer.reset();
      window.drone.renderer.render(window.drone.runner, window.drone.ghost);
    });
    await page.screenshot({ path: mobile ? "artifacts/mobile-start.png" : "artifacts/start-line.png" });
    const before = await page.evaluate(() => [...window.drone.runner.sim.state.p]);
    await page.keyboard.down("KeyW");
    await page.keyboard.down("KeyR");
    const after = await page.evaluate(() => {
      const d = window.drone;
      for (let i = 0; i < 300; i++) d.runner.step(d.input.update());
      return [...d.runner.sim.state.p];
    });
    await page.keyboard.up("KeyW");
    await page.keyboard.up("KeyR");
    assert.ok(Math.hypot(after[0] - before[0], after[1] - before[1]) > 1, "keyboard forward");
    assert.ok(after[2] > before[2] + 0.5, "keyboard altitude");
    await page.locator("#reset").click();
    assert.equal(await page.evaluate(() => window.drone.runner.time), 0);
    await page.keyboard.down("KeyW");
    await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    assert.equal(await page.evaluate(() => window.drone.input.update().forward), 0);
    await page.keyboard.up("KeyW");
    const pausedTime = await page.evaluate(() => window.drone.runner.time);
    await page.waitForTimeout(200);
    assert.equal(await page.evaluate(() => window.drone.runner.time), pausedTime);
    await page.locator("#camera").click();
    assert.equal(await page.evaluate(() => window.drone.renderer.cameraMode), "FPV");
    await page.waitForTimeout(150);
    await page.evaluate(() => {
      window.drone.renderer.reset();
      window.drone.renderer.render(window.drone.runner, window.drone.ghost);
    });
    await page.screenshot({ path: mobile ? "artifacts/mobile-fpv.png" : "artifacts/desktop-fpv.png" });
    await page.locator("#camera").click();
    await page.locator('[data-mode="RACE AI"]').click();
    await page.evaluate(() => window.drone.pause(true));
    await page.waitForTimeout(250);
    assert.equal(await page.evaluate(() => window.drone.renderer.ghost.visible), true);
    assert.ok(await page.locator("#ghost-time").isVisible());
    if (mobile) {
      const left = await page.locator("#left-stick").boundingBox(),
        right = await page.locator("#right-stick").boundingBox();
      assert.ok(left && right, "mobile sticks visible");
      const cdp = await context.newCDPSession(page);
      const point = (r, id) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2, id });
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point(left, 1), point(right, 2)] });
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [
          { ...point(left, 1), y: left.y + left.height * 0.2 },
          { ...point(right, 2), y: right.y + right.height * 0.2 },
        ],
      });
      const command = await page.evaluate(() => window.drone.input.update());
      assert.ok(command.vertical > 0.5 && command.forward > 0.5, "simultaneous sticks");
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      assert.deepEqual(await page.evaluate(() => window.drone.input.update()), { forward: 0, strafe: 0, vertical: 0, yaw: 0 });
      await page.setViewportSize({ width: 915, height: 412 });
      await page.waitForTimeout(250);
      assert.ok(await page.locator("#right-stick").isVisible());
      const stickBounds = await page.locator("#right-stick").boundingBox();
      assert.ok(stickBounds.y >= 0 && stickBounds.y + stickBounds.height <= 412, "landscape sticks within viewport");
      await page.evaluate(() => {
        window.drone.renderer.reset();
        window.drone.renderer.render(window.drone.runner, window.drone.ghost);
      });
      await page.screenshot({ path: "artifacts/mobile-landscape.png" });
      await page.setViewportSize({ width: 412, height: 915 });
    }
    const preserves = await page.evaluate(() => {
      const s = window.drone.runner.sim;
      s.data.qpos[0] = 3;
      s.data.qvel[0] = 2;
      s.data.time = 1;
      const before = [...s.data.qpos, ...s.data.qvel, s.data.time];
      s.setMass(1.2);
      return JSON.stringify(before) === JSON.stringify([...s.data.qpos, ...s.data.qvel, s.data.time]);
    });
    assert.ok(preserves, "mass change preserves live state");
    await page.locator('[data-mode="AUTOPILOT"]').click();
    await page.evaluate(() => window.drone.pause(true));
    await page.evaluate(() => {
      const r = window.drone.runner;
      while (r.time < 5) r.step();
    });
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      window.drone.renderer.reset();
      window.drone.renderer.render(window.drone.runner, window.drone.ghost);
    });
    await page.screenshot({ path: mobile ? "artifacts/mobile.png" : "artifacts/desktop.png" });
    const bounds = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      width: innerWidth,
      height: innerHeight,
      buttons: [...document.querySelectorAll(".panel button")].map((e) => {
        const r = e.getBoundingClientRect();
        return { x: r.x, y: r.y, right: r.right, bottom: r.bottom };
      }),
    }));
    assert.ok(bounds.scroll <= bounds.width);
    assert.ok(
      bounds.buttons.every((r) => r.x >= 0 && r.right <= bounds.width && r.y >= 0 && r.bottom <= bounds.height),
      "controls within viewport"
    );
    await page.evaluate(() => {
      const r = window.drone.runner;
      while (r.time < 9.3) r.step();
    });
    await page.waitForTimeout(150);
    await page.evaluate(() => {
      window.drone.renderer.reset();
      window.drone.renderer.render(window.drone.runner, window.drone.ghost);
    });
    await page.screenshot({ path: mobile ? "artifacts/mobile-bank.png" : "artifacts/tight-corner.png" });
    await page.evaluate(() => window.drone.reset());
    await page.evaluate(() => window.drone.pause(false));
    await page.waitForTimeout(2200);
    reports[mobile ? "mobile-emulation" : "desktop"] = { rollouts, frameMetrics: await page.evaluate(() => window.drone.stats), errors };
    assert.deepEqual(errors, []);
    assert.equal(await page.evaluate(() => document.getElementById("error").hidden), true, "no caught runtime errors");
    await context.close();
  }
  fs.writeFileSync("artifacts/browser-results.json", JSON.stringify(reports, null, 2) + "\n");
  console.log(JSON.stringify(reports, null, 2));
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
