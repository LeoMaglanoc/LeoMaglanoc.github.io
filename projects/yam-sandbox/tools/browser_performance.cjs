const { chromium } = require("playwright"),
  fs = require("fs"),
  path = require("path");
(async () => {
  const b = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
  });
  try {
    let report = {
      environment:
        "Cloud Linux Chromium/SwiftShader; no concurrent build or recording. Built Jekyll/minified assets. Phone touch/viewport emulation, not physical Android.",
      browser: b.version(),
      viewports: {},
    };
    for (const [name, width, height] of [
      ["desktop", 1440, 900],
      ["phone-portrait", 390, 844],
      ["phone-landscape", 844, 390],
    ]) {
      const p = await b.newPage({
        viewport: { width, height },
        deviceScaleFactor: 1,
        isMobile: name !== "desktop",
        hasTouch: name !== "desktop",
      });
      await p.goto(
        process.env.YAM_URL ||
          "http://localhost:8001/assets/interactive/yam-sandbox/index.html",
      );
      await p.waitForFunction(() => window.yam, null, { timeout: 60000 });
      await p.click("#run");
      const start = await p.evaluate(() => {
        yam.metrics.frameTimes = [];
        return { sim: yam.sim.data.time, wall: performance.now() };
      });
      let memory = [];
      for (let i = 0; i < 6; i++) {
        await p.waitForTimeout(1000);
        memory.push(
          await p.evaluate(() => ({
            js: performance.memory?.usedJSHeapSize,
            wasm: yam.sim.data.qpos.buffer.byteLength,
          })),
        );
      }
      const m = await p.evaluate((start) => {
        const f = yam.metrics.frameTimes,
          wall = (performance.now() - start.wall) / 1000;
        return {
          renderedFPS: 1000 / (f.reduce((a, b) => a + b, 0) / f.length),
          physicsPace: (yam.sim.data.time - start.sim) / wall,
          loadedMs: yam.metrics.loadedMs,
          frameCount: f.length,
          renderTriangles: yam.view.renderer.info.render.triangles,
          resources: performance
            .getEntriesByType("resource")
            .map((r) => ({
              url: r.name,
              encodedBytes: r.encodedBodySize,
              transferSize: r.transferSize,
            })),
        };
      }, start);
      report.viewports[name] = {
        width,
        height,
        ...m,
        sampledPeakJSHeapBytes: Math.max(...memory.map((m) => m.js || 0)),
        sampledPeakWasmBytes: Math.max(...memory.map((m) => m.wasm)),
        memorySamples: memory,
      };
      console.log(name, m.renderedFPS, m.physicsPace);
      fs.writeFileSync(
        path.resolve(__dirname, "../results/performance-isolated.json"),
        JSON.stringify(report, null, 2),
      );
      await p.close();
    }
  } finally {
    await b.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
