const { chromium } = require("playwright");
const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const origin = process.env.SOCCER_ORIGIN || "http://127.0.0.1:8097";
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome",
    args: [
      "--no-sandbox",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
    ],
  });
  try {
    const context = await browser.newContext({
      viewport: { width: 412, height: 915 },
      isMobile: true,
      hasTouch: true,
    });
    const page = await context.newPage();
    // Reproduce a queued callback older than the click that starts replay.
    await page.addInitScript(() => {
      const raf = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = (callback) =>
        raf((timestamp) => callback(timestamp - 250));
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(
      `${origin}/assets/interactive/g1-soccer/index.html?debug=1`,
    );
    await page.waitForFunction(() => window.soccerLab, null, {
      timeout: 90000,
    });
    const initial = await page.evaluate(() =>
      structuredClone(window.soccerLab.state),
    );
    await page.setViewportSize({ width: 915, height: 412 });
    await page.waitForTimeout(200);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    assert.deepEqual(
      await page.evaluate(() => window.soccerLab.state.qpos),
      initial.qpos,
    );
    await page.locator('[data-tool="camera"]').click();
    const cameraBefore = await page.evaluate(() =>
      window.soccerLab.view.camera.position.toArray(),
    );
    const bounds = await page.locator("#field").boundingBox(),
      cdp = await context.newCDPSession(page);
    const center = {
      x: bounds.x + bounds.width * 0.55,
      y: bounds.y + bounds.height * 0.6,
    };
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [center],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: center.x + 60, y: center.y + 10 }],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    assert.notDeepEqual(
      await page.evaluate(() =>
        window.soccerLab.view.camera.position.toArray(),
      ),
      cameraBefore,
    );
    assert.deepEqual(
      await page.evaluate(() => window.soccerLab.state.qpos),
      initial.qpos,
      "Camera gestures must not perturb physics",
    );
    await page.getByRole("button", { name: "Reset view" }).click();
    await page.setViewportSize({ width: 412, height: 915 });
    await page.locator('[data-tool="target"]').click();
    await page.locator("#map").focus();
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => window.soccerLab.state.time >= 0.2);
    await page.getByRole("button", { name: "About this experiment" }).click();
    await page.locator("#about-dialog").waitFor({ state: "visible" });
    const pausedTime = await page.evaluate(() => window.soccerLab.state.time);
    await page.waitForTimeout(200);
    assert.equal(
      await page.evaluate(() => window.soccerLab.state.time),
      pausedTime,
    );
    await page.getByRole("button", { name: "Close about" }).click();
    await page.waitForFunction(
      (t) => window.soccerLab.state.time > t,
      pausedTime,
    );
    await page.evaluate(() => window.soccerLab.request("pause"));
    // Repeated mode changes must keep their click targets stable between frames.
    for (let i = 0; i < 8; i++) {
      console.log(`Replay transition ${i + 1}/8`);
      await page.getByRole("button", { name: "Watch reference" }).click();
      await page.waitForFunction(
        () =>
          document.querySelector("#mode-badge").textContent ===
          "RECORDED REPLAY",
      );
      await page
        .getByRole("button", { name: "Return to live" })
        .first()
        .click();
      await page
        .waitForFunction(
          () =>
            document.querySelector("#mode-badge").textContent ===
            "LIVE SIMULATION",
          null,
          { timeout: 5000 },
        )
        .catch(async (e) => {
          console.error(await page.locator("body").innerText());
          throw e;
        });
      assert.ok(
        (await page.locator("#performance").innerText()).startsWith(
          "Live physics",
        ),
      );
    }
    assert.deepEqual(errors, []);
    await context.close();
    const failed = await browser.newContext();
    const fp = await failed.newPage();
    await fp.route("**/models/coach.onnx", (route) =>
      route.fulfill({ status: 404, body: "Missing model" }),
    );
    await fp.goto(`${origin}/assets/interactive/g1-soccer/index.html`);
    await fp
      .getByRole("button", { name: "Reload demo" })
      .waitFor({ state: "visible", timeout: 90000 });
    const failureMessage = await fp.locator("#loading-message").innerText();
    assert.ok(failureMessage.length > 10);
    assert.equal(await fp.locator("#start").isDisabled(), true);
    await failed.close();
    const report = {
      browser: browser.version(),
      orientation_change: true,
      repeated_replay_transitions: 8,
      delayed_animation_timestamps_ms: 250,
      touch_camera_orbit: true,
      camera_preserves_physics: true,
      keyboard_start: true,
      about_pauses_and_resumes: true,
      missing_policy_shows_retry: true,
      failureMessage,
      errors,
    };
    fs.writeFileSync(
      path.resolve(__dirname, "../results/edge-cases.json"),
      JSON.stringify(report, null, 2) + "\n",
    );
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
