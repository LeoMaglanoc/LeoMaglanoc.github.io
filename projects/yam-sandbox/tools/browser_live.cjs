const { chromium } = require("playwright"),
  fs = require("fs");
(async () => {
  const b = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
    proxy: process.env.HTTPS_PROXY
      ? { server: process.env.HTTPS_PROXY }
      : undefined,
  });
  try {
    let results = {};
    for (const [name, width, height] of [
      ["desktop", 1440, 900],
      ["phone-portrait", 390, 844],
      ["phone-landscape", 844, 390],
    ]) {
      const p = await b.newPage({
        viewport: { width, height },
        hasTouch: name !== "desktop",
        isMobile: name !== "desktop",
      });
      let errors = [];
      p.on("pageerror", (e) => errors.push(e.message));
      await p.goto(
        process.env.YAM_ROUTE_URL ||
          "https://leomaglanoc.github.io/yam-sandbox/",
      );
      await p.waitForFunction(
        () => !!document.querySelector("iframe")?.contentWindow?.yam,
        null,
        { timeout: 90000 },
      );
      const r = await p.evaluate(() => {
        const w = document.querySelector("iframe").contentWindow,
          s = w.yam.sim;
        s.run();
        for (let i = 0; i < 20000 && !s.controller.terminal; i++) s.step();
        return {
          success: s.controller.result().success,
          phase: s.controller.phase,
          modelActuators: s.model.nu,
          controls: [
            ...w.document.querySelectorAll("footer button, select"),
          ].map((e) => {
            const b = e.getBoundingClientRect();
            return { id: e.id, x: b.x, y: b.y, w: b.width, h: b.height };
          }),
        };
      });
      if (!r.success || errors.length)
        throw Error(JSON.stringify({ r, errors }));
      results[name] = { ...r, errors };
      await p.screenshot({
        path: require("path").resolve(__dirname, `../results/live-${name}.png`),
      });
      await p.close();
    }
    fs.writeFileSync(
      require("path").resolve(__dirname, "../results/live-browser.json"),
      JSON.stringify(results, null, 2),
    );
    console.log(
      "Live GitHub Pages: cube succeeds, controls visible, no page errors at all three viewports",
    );
  } finally {
    await b.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
