const { chromium } = require("playwright");
const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const origin = process.env.SOCCER_ORIGIN || "http://127.0.0.1:8097",
  root = path.resolve(__dirname, ".."),
  output = path.join(root, "results");
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome",
    args: [
      "--no-sandbox",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
    ],
  });
  const reports = [];
  try {
    for (const [name, width, height, mobile] of [
      ["desktop", 1440, 900, false],
      ["phone-portrait", 412, 915, true],
      ["phone-landscape", 915, 412, true],
    ]) {
      console.log(`Testing ${name}`);
      const context = await browser.newContext({
        viewport: { width, height },
        isMobile: mobile,
        hasTouch: mobile,
        deviceScaleFactor: mobile ? 2 : 1,
      });
      const page = await context.newPage();
      const errors = [],
        missing = [],
        warnings = [];
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("response", (r) => {
        if (r.status() >= 400) missing.push(`${r.status()} ${r.url()}`);
      });
      page.on("console", (m) => {
        if (m.type() === "error" || m.type() === "warning")
          warnings.push(m.text());
      });
      const loadStart = Date.now();
      await page.goto(
        `${origin}/assets/interactive/g1-soccer/index.html?debug=1`,
      );
      await page.waitForFunction(
        () => window.soccerLab && document.querySelector("#loading").hidden,
        null,
        { timeout: 90000 },
      );
      const load_ms = Date.now() - loadStart;
      const state = () =>
        page.evaluate(() => structuredClone(window.soccerLab.state));
      const initial = await state();
      assert.equal(initial.time, 0);
      assert.equal(initial.seed, 1000);
      // Real Chrome touch events, including cancellation, use the same canvas handlers as visitors.
      const cdp = await context.newCDPSession(page),
        map = await page.locator("#map").boundingBox();
      async function touch(type, points) {
        await cdp.send("Input.dispatchTouchEvent", {
          type,
          touchPoints: points,
        });
      }
      const point = {
        x: map.x + map.width * 0.68,
        y: map.y + map.height * 0.4,
      };
      if (mobile) {
        await touch("touchStart", [point]);
        await touch("touchEnd", []);
      } else await page.mouse.click(point.x, point.y);
      await page.waitForFunction(
        () =>
          Math.abs(window.soccerLab.state.target[0] - 2.8894623740404235) > 0.1,
      );
      const target = await state();
      assert.ok(Math.abs(target.target[0]) < 3.4);
      assert.equal(target.time, 0);
      const beforeCancel = target.target.slice();
      await touch("touchStart", [
        { x: map.x + map.width * 0.3, y: map.y + map.height * 0.7 },
      ]);
      await touch("touchCancel", []);
      await page.waitForTimeout(100);
      assert.deepEqual((await state()).target, beforeCancel);
      await page.locator('[data-tool="ball"]').click();
      const ballPoint = {
        x: map.x + map.width * 0.8,
        y: map.y + map.height * 0.65,
      };
      if (mobile) {
        await touch("touchStart", [point]);
        await touch("touchMove", [ballPoint]);
        await touch("touchEnd", []);
      } else {
        await page.mouse.move(point.x, point.y);
        await page.mouse.down();
        await page.mouse.move(ballPoint.x, ballPoint.y);
        await page.mouse.up();
      }
      await page.waitForFunction(
        () =>
          Math.abs(window.soccerLab.state.qpos[19] - 1.1319958489211834) > 0.1,
      );
      assert.equal((await state()).time, 0);
      await page.locator('[data-tool="target"]').click();
      await page.locator("#map").focus();
      await page.keyboard.press("ArrowRight");
      await page.waitForFunction(
        (x) => window.soccerLab.state.target[0] > x + 0.1,
        target.target[0],
      );
      // Reload a known seed so this live attempt can be compared with the native result.
      await page.evaluate(() =>
        window.soccerLab.request("layout", { index: 0 }),
      );
      await page.getByRole("button", { name: "Start dribbling" }).click();
      await page.waitForFunction(() => window.soccerLab.state.time >= 1, null, {
        timeout: 60000,
      });
      await page.getByRole("button", { name: "Pause attempt" }).click();
      await page.waitForFunction(() => !window.soccerLab.state.running);
      const paused = await state();
      await page.waitForTimeout(300);
      assert.equal((await state()).time, paused.time);
      assert.notDeepEqual(
        paused.qpos,
        initial.qpos,
        "The learned policy must actually move the robot",
      );
      await page.getByRole("button", { name: "Reset", exact: true }).click();
      await page.waitForFunction(() => window.soccerLab.state.time === 0);
      assert.deepEqual(
        (await state()).qpos,
        initial.qpos,
        "Reset must restore the complete pose",
      );
      assert.deepEqual((await state()).command, [0, 0, 0]);
      // Run the unmodified first episode with rendering and the real scheduler enabled.
      const attemptStart = Date.now();
      await page.getByRole("button", { name: "Start dribbling" }).click();
      await page.waitForFunction(() => !!window.soccerLab.state.result, null, {
        timeout: 90000,
      });
      const completed = await state(),
        attempt_wall_ms = Date.now() - attemptStart;
      assert.equal(
        completed.result,
        "success",
        `${name}: expected seed 1000 to reach target`,
      );
      const performance = await page.locator("#performance").innerText();
      assert.ok(
        !performance.startsWith("-"),
        "Simulation speed must not become negative after reset",
      );
      await page.getByRole("button", { name: "Reset", exact: true }).click();
      await page.waitForFunction(() => window.soccerLab.state.time === 0);
      // Recurrent state is reset: the first second must be repeatable, even after a full attempt.
      await page.evaluate(async () => {
        await window.soccerLab.request("start");
      });
      await page.waitForFunction(() => window.soccerLab.state.time >= 0.2);
      await page.evaluate(() => window.soccerLab.request("pause"));
      await page
        .getByRole("button", { name: "New layout", exact: true })
        .click();
      await page.waitForFunction(() => window.soccerLab.state.seed === 1001);
      assert.equal((await state()).time, 0);
      await page.getByRole("button", { name: "Watch reference" }).click();
      await page.waitForFunction(
        () =>
          document.querySelector("#mode-badge").textContent ===
          "RECORDED REPLAY",
      );
      await page.waitForFunction(() => window.soccerLab.state.time > 0.2);
      assert.equal(await page.locator('[data-tool="ball"]').isDisabled(), true);
      await page.getByRole("button", { name: "Restart replay" }).click();
      await page
        .getByRole("button", { name: "Return to live" })
        .first()
        .click();
      await page.waitForFunction(
        () =>
          document.querySelector("#mode-badge").textContent ===
          "LIVE SIMULATION",
      );
      assert.equal((await state()).time, 0);
      await page.waitForFunction(() =>
        document
          .querySelector("#performance")
          .textContent.startsWith("Live physics"),
      );
      await page.getByRole("button", { name: "About this experiment" }).click();
      await page.locator("#about-dialog").waitFor({ state: "visible" });
      await page.getByRole("button", { name: "Close about" }).click();
      const bounds = await page.locator("button").evaluateAll((bs) =>
        bs
          .filter(
            (b) =>
              b.getBoundingClientRect().width &&
              b.getBoundingClientRect().height,
          )
          .map((b) => {
            const r = b.getBoundingClientRect();
            return {
              label: b.textContent.trim(),
              x: r.x,
              y: r.y,
              w: r.width,
              h: r.height,
            };
          }),
      );
      for (const b of bounds)
        assert.ok(
          b.x >= 0 &&
            b.y >= 0 &&
            b.x + b.w <= width + 1 &&
            b.y + b.h <= height + 1,
          `${name}: clipped control ${JSON.stringify(b)}`,
        );
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
      await page.screenshot({
        path: path.join(output, `${name}.jpg`),
        type: "jpeg",
        quality: 85,
      });
      assert.deepEqual(errors, []);
      assert.deepEqual(missing, []);
      const report = {
        name,
        viewport: { width, height },
        mobile_emulation: mobile,
        browser: browser.version(),
        load_ms,
        attempt_wall_ms,
        simulation_seconds: completed.time,
        realtime_factor: completed.time / (attempt_wall_ms / 1000),
        outcome: completed.result,
        performance,
        errors,
        missing,
        warnings,
        control_bounds: bounds,
      };
      reports.push(report);
      fs.writeFileSync(
        path.join(output, "chrome-ui.json"),
        JSON.stringify(reports, null, 2) + "\n",
      );
      console.log(
        JSON.stringify({
          name,
          load_ms,
          attempt_wall_ms,
          outcome: completed.result,
          realtime_factor: report.realtime_factor,
        }),
      );
      await context.close();
    }
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
