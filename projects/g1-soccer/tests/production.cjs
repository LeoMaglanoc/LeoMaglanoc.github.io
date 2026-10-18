const { chromium } = require("playwright");
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path");
const origin = process.env.SOCCER_ORIGIN || "http://127.0.0.1:8098";
(async () => {
  const options = {
    executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome",
    args: [
      "--no-sandbox",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
    ],
  };
  if (origin.startsWith("https:") && process.env.HTTPS_PROXY)
    options.proxy = {
      server: process.env.HTTPS_PROXY,
      bypass: "localhost,127.0.0.1",
    };
  const browser = await chromium.launch(options),
    reports = [];
  try {
    for (const [name, width, height, mobile] of [
      ["desktop", 1440, 900, false],
      ["phone-portrait", 412, 915, true],
      ["phone-landscape", 915, 412, true],
    ]) {
      const context = await browser.newContext({
          viewport: { width, height },
          isMobile: mobile,
          hasTouch: mobile,
        }),
        page = await context.newPage();
      const errors = [],
        missing = [];
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("response", (r) => {
        if (
          r.status() >= 400 &&
          r.url().includes("/assets/interactive/g1-soccer/")
        )
          missing.push(`${r.status()} ${r.url()}`);
      });
      await page.goto(`${origin}/blog/AI-coding-agent-case-study/`, {
        waitUntil: "domcontentloaded",
      });
      const link = page.getByRole("link", {
        name: "G1 Soccer Lab",
        exact: true,
      });
      assert.equal(await link.count(), 1);
      assert.ok((await link.getAttribute("href")).endsWith("/soccer/"));
      assert.equal(
        await page
          .getByRole("link", {
            name: "CatchBot — outrun a predictive robot",
            exact: true,
          })
          .count(),
        1,
      );
      // Visit the actual stable route and verify its iframe, built/minified code and policies.
      await page.goto(`${origin}/soccer/?debug=1`);
      const frame = await (
        await page.locator("iframe").elementHandle()
      ).contentFrame();
      await frame.waitForFunction(() => window.soccerLab, null, {
        timeout: 120000,
      });
      await frame.getByRole("button", { name: "Start dribbling" }).click();
      await frame.waitForFunction(
        () => window.soccerLab.state.time >= 2.0,
        null,
        { timeout: 60000 },
      );
      const livePerformance = await frame.locator("#performance").innerText();
      await frame.evaluate(() => window.soccerLab.request("pause"));
      const state = await frame.evaluate(() => ({
        time: window.soccerLab.state.time,
        qpos: window.soccerLab.state.qpos,
        mode: document.querySelector("#mode-badge").textContent,
      }));
      assert.equal(state.mode, "LIVE SIMULATION");
      assert.ok(state.time > 0);
      await page.screenshot({
        path: path.resolve(
          __dirname,
          `../results/${
            origin.startsWith("https:") ? "production" : "built"
          }-${name}.jpg`,
        ),
        type: "jpeg",
        quality: 80,
      });
      assert.deepEqual(errors, []);
      assert.deepEqual(missing, []);
      reports.push({
        origin,
        name,
        viewport: { width, height },
        browser: browser.version(),
        blog_link: true,
        iframe_loaded: true,
        live_physics: true,
        livePerformance,
        state,
        errors,
        missing,
      });
      await context.close();
      console.log(`${name}: built route, blog link and live physics passed`);
    }
    fs.writeFileSync(
      path.resolve(
        __dirname,
        `../results/${
          origin.startsWith("https:") ? "production" : "built"
        }-smoke.json`,
      ),
      JSON.stringify(reports, null, 2) + "\n",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
