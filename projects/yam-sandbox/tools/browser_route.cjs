const { chromium } = require("playwright"),
  fs = require("fs");
(async () => {
  let b = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
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
      const errors = [];
      p.on("pageerror", (e) => errors.push(e.message));
      await p.goto(
        process.env.YAM_ROUTE_URL || "http://localhost:8001/yam-sandbox/",
      );
      const frame = p.frameLocator("iframe");
      await frame.locator("#run").waitFor();
      await p.waitForFunction(
        () => {
          const w = document.querySelector("iframe").contentWindow;
          return !!w.yam;
        },
        null,
        { timeout: 60000 },
      );
      const metrics = await p.evaluate(() => {
        const f = document.querySelector("iframe"),
          w = f.contentWindow,
          r = f.getBoundingClientRect();
        return {
          iframeWidth: r.width,
          iframeHeight: r.height,
          innerWidth: w.innerWidth,
          innerHeight: w.innerHeight,
          modelActuators: w.yam.sim.model.nu,
          sceneHash: w.yam.sim.ref.scene_sha256,
        };
      });
      if (
        metrics.iframeWidth !== width ||
        metrics.iframeHeight !== height ||
        metrics.innerWidth !== width ||
        metrics.innerHeight !== height ||
        errors.length
      )
        throw Error(JSON.stringify({ metrics, errors }));
      results[name] = { ...metrics, errors };
      await p.close();
    }
    fs.writeFileSync(
      require("path").resolve(
        __dirname,
        "../results/public-route-browser.json",
      ),
      JSON.stringify(results, null, 2),
    );
    console.log(
      "Built /yam-sandbox/ iframe fills all three viewports and initializes physics",
    );
  } finally {
    await b.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
