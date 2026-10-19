const { chromium } = require("playwright"),
  fs = require("fs");
const out = require("path").resolve(__dirname, "../results");
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--enable-unsafe-swiftshader",
    ],
  });
  let results = {
    browser: browser.version(),
    hardware:
      "Cloud Linux; SwiftShader software WebGL. Phone viewport/touch emulation, not physical Android.",
    viewports: {},
  };
  if (
    process.env.YAM_VIEWPORT &&
    fs.existsSync(`${out}/viewport-validation.json`)
  )
    results = JSON.parse(fs.readFileSync(`${out}/viewport-validation.json`));
  for (const [name, width, height] of [
    ["desktop", 1440, 900],
    ["phone-portrait", 390, 844],
    ["phone-landscape", 844, 390],
  ].filter(
    (v) => !process.env.YAM_VIEWPORT || v[0] === process.env.YAM_VIEWPORT,
  )) {
    const context = await browser.newContext({
      viewport: { width, height },
      hasTouch: name !== "desktop",
      isMobile: name !== "desktop",
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    const errors = [],
      badRequests = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("response", (r) => {
      if (r.status() >= 400) badRequests.push([r.status(), r.url()]);
    });
    await page.goto(
      process.env.YAM_URL ||
        "http://localhost:8000/assets/interactive/yam-sandbox/index.html",
    );
    await page.waitForFunction(() => window.yam, null, { timeout: 60000 });
    await page.screenshot({ path: `${out}/${name}.png` });
    const layout = await page.evaluate(() => ({
      width: innerWidth,
      height: innerHeight,
      scrollWidth: document.body.scrollWidth,
      controls: [...document.querySelectorAll("footer button,select")].map(
        (e) => {
          let b = e.getBoundingClientRect();
          return { id: e.id, x: b.x, y: b.y, w: b.width, h: b.height };
        },
      ),
    }));
    if (
      layout.scrollWidth > width ||
      layout.controls.some(
        (c) =>
          c.x < 0 ||
          c.y < 0 ||
          c.x + c.w > width + 0.1 ||
          c.y + c.h > height + 0.1 ||
          c.h < 43,
      )
    )
      throw Error("Controls outside viewport");
    await page.click("#run");
    await page.waitForTimeout(650);
    await page.click("#pause");
    const frozen = await page.evaluate(() => yam.sim.data.time);
    await page.waitForTimeout(450);
    const frozen2 = await page.evaluate(() => yam.sim.data.time);
    if (frozen !== frozen2) throw Error("Pause did not freeze physics");
    await page.click("#pause");
    const a = await page.evaluate(() => {
      yam.metrics.frameTimes = [];
      return { sim: yam.sim.data.time, wall: performance.now() };
    });
    await page.waitForTimeout(6000);
    const performanceResult = await page.evaluate((a) => {
      const f = yam.metrics.frameTimes;
      const wall = (performance.now() - a.wall) / 1000;
      return {
        renderedFPS: f.length / (f.reduce((x, y) => x + y, 0) / 1000),
        meanFrameMs: f.reduce((x, y) => x + y, 0) / f.length,
        physicsPace: (yam.sim.data.time - a.sim) / wall,
        loadedMs: yam.metrics.loadedMs,
        wasmHeapBytes: yam.sim.data.qpos.buffer.byteLength,
        jsUsedHeapBytes: performance.memory?.usedJSHeapSize,
        resources: performance
          .getEntriesByType("resource")
          .map((r) => ({
            url: r.name,
            transferSize: r.transferSize,
            encodedBytes: r.encodedBodySize,
          })),
      };
    }, a);
    // Inspect the actual contact/lift moment without pose replay.
    await page.click("#pause");
    await page.evaluate(() => {
      const s = yam.sim;
      for (
        let i = 0;
        i < 20000 &&
        s.controller.phase !== "TRANSFER" &&
        !s.controller.terminal;
        i++
      )
        s.step();
      yam.view.update();
    });
    await page.screenshot({ path: `${out}/${name}-grasp.png` });
    const cube = await page.evaluate(() => {
      const s = yam.sim;
      for (let i = 0; i < 20000 && !s.controller.terminal; i++) s.step();
      return s.controller.result();
    });
    if (!cube.success) throw Error(cube.reason);
    await page.click("#reset");
    const reset = await page.evaluate(() => ({
      time: yam.sim.data.time,
      controller: yam.sim.controller,
      pos: Array.from(yam.sim.data.qpos.slice(yam.sim.oq, yam.sim.oq + 3)),
    }));
    if (reset.controller !== null || Math.abs(reset.time - 1) > 1e-8)
      throw Error("Reset failed");
    await page.selectOption("#task", "cylinder");
    const cylinder = await page.evaluate(() => {
      const s = yam.sim;
      s.run();
      for (let i = 0; i < 20000 && !s.controller.terminal; i++) s.step();
      yam.view.update();
      return s.controller.result();
    });
    if (!cylinder.success) throw Error(cylinder.reason);
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${out}/${name}-placed.png` });
    await page.click("#about");
    if (!(await page.locator("#details").isVisible()))
      throw Error("About failed");
    await page.click("#about");
    results.viewports[name] = {
      width,
      height,
      layout,
      pauseFrozen: true,
      reset,
      performance: performanceResult,
      cubeSuccess: cube.success,
      cylinderSuccess: cylinder.success,
      errors,
      badRequests,
    };
    fs.writeFileSync(
      `${out}/viewport-validation.json`,
      JSON.stringify(results, null, 2),
    );
    console.log(name, JSON.stringify(performanceResult), errors, badRequests);
    await context.close();
  }
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
