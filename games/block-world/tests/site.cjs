const { chromium } = require("playwright"),
  assert = require("node:assert/strict"),
  fs = require("node:fs");
(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  const context = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
  const page = await context.newPage(),
    errors = [];
  page.setDefaultTimeout(45000);
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && !m.text().includes("favicon")) errors.push(m.text());
  });
  await page.goto(process.env.SITE_URL || "http://127.0.0.1:8098/block-world/");
  const frame = page.frameLocator("iframe"),
    game = page.frames().find((f) => f.url().includes("/assets/interactive/block-world/"));
  const card = await frame.locator(".card").boundingBox();
  assert(card.y >= 0 && card.y + card.height <= 390, "landscape title card fits vertically");
  await page.screenshot({ path: "artifacts/browser/phone-menu.png" });
  await frame.locator("#play").click();
  await game.waitForFunction(() => window.robotWorldState?.loading === false, null, { timeout: 90000 });
  await frame.locator("#play").click();
  await game.waitForFunction(() => window.robotWorldState?.active);
  await page.screenshot({ path: "artifacts/browser/phone-island.png" });
  await frame.locator("#fullscreen").click();
  await page.waitForFunction(() => !!document.fullscreenElement);
  assert(await game.evaluate(() => !!document.fullscreenElement), "iframe fullscreen permission works");
  await frame.locator("#fullscreen").click();
  await page.waitForFunction(() => !document.fullscreenElement);
  await frame.locator("#pause").click();
  await frame.locator("#reset").click();
  await page.screenshot({ path: "artifacts/browser/phone-reset.png" });
  await frame.locator("#cancel-reset").click();
  assert(await frame.locator("#reset-confirm").isHidden());
  await page.goto("http://127.0.0.1:8098/blog/AI-coding-agent-case-study/");
  const link = page.getByRole("link", { name: "Robot World", exact: true });
  assert.equal(await link.getAttribute("href"), "/block-world/");
  assert.equal(errors.length, 0, errors.join("\n"));
  console.log("PASS: landscape menu fits, embedded game loads, iframe fullscreen enters/exits, reset cancellation, blog link; no browser errors");
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
