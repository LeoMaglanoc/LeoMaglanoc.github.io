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
    const p = await b.newPage({ viewport: { width: 844, height: 390 } }),
      url =
        process.env.YAM_URL ||
        "http://localhost:8000/assets/interactive/yam-sandbox/index.html";
    let errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    await p.goto(url);
    await p.waitForFunction(() => window.yam);
    const resets = await p.evaluate(() => {
      const s = yam.sim,
        heap = s.data.qpos.buffer.byteLength,
        objects = yam.view.objects.size;
      for (let i = 0; i < 40; i++) s.reset(i % 2 ? "cube" : "cylinder");
      yam.view.update();
      return {
        count: 40,
        beforeWasmBytes: heap,
        afterWasmBytes: s.data.qpos.buffer.byteLength,
        beforeRenderObjects: objects,
        afterRenderObjects: yam.view.objects.size,
      };
    });
    if (
      resets.beforeWasmBytes !== resets.afterWasmBytes ||
      resets.beforeRenderObjects !== resets.afterRenderObjects
    )
      throw Error("Reset resource growth");
    const lifecycle = await p.evaluate(() => {
      dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true }));
      return { nu: yam.sim.model.nu, alive: yam.sim.data.qpos.length === 30 };
    });
    if (!lifecycle.alive) throw Error("bfcache resource failure");
    await p.click("#about");
    const panel = await p
      .locator("#details")
      .evaluate((e) => ({
        clientHeight: e.clientHeight,
        scrollHeight: e.scrollHeight,
        overflow: getComputedStyle(e).overflowY,
      }));
    if (panel.scrollHeight > panel.clientHeight && panel.overflow !== "auto")
      throw Error("Clipped About");
    await p.goto("about:blank");
    await p.goBack();
    await p.waitForFunction(() => window.yam);
    if (errors.length) throw Error(errors.join("\n"));
    const fail = await b.newPage();
    await fail.route("**/scene/bimanual_scene.xml", (r) =>
      r.fulfill({ status: 503, body: "Unavailable" }),
    );
    await fail.goto(url);
    await fail.waitForFunction(() =>
      document
        .getElementById("loading")
        .textContent.includes("Could not start"),
    );
    const failure = await fail.locator("#loading").textContent();
    if (!(await fail.locator("#run").isDisabled()))
      throw Error("Run enabled on load failure");
    fs.writeFileSync(
      path.resolve(__dirname, "../results/browser-contracts.json"),
      JSON.stringify(
        {
          resets,
          lifecycle,
          about: panel,
          backNavigation: true,
          loadFailure: failure,
          errors,
        },
        null,
        2,
      ),
    );
    console.log(
      "Reset, bfcache, Back, About scrolling, and meaningful load failure passed",
    );
  } finally {
    await b.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
