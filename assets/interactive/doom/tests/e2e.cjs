/*
 * Run with a local static server:
 * NODE_PATH=/path/to/playwright/node_modules node assets/interactive/doom/tests/e2e.cjs
 */
const assert = require("node:assert/strict");
const { chromium } = require("playwright");

const baseURL = process.env.DOOM_E2E_URL || "http://127.0.0.1:4173/assets/interactive/doom/";
const executablePath = process.env.CHROME_PATH || "/usr/bin/google-chrome";

async function desktop(browser) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto(baseURL, { waitUntil: "networkidle" });
  await assert.doesNotReject(() => page.getByRole("button", { name: "START MATCH" }).click());
  if (process.env.DOOM_E2E_RESET_ONLY === "1") {
    await page.waitForFunction(() => document.querySelector("#status").textContent === "LOADING MAP", null, { timeout: 12_000 });
    await page.getByRole("button", { name: "RESET MATCH" }).click();
    await page.waitForFunction(() => document.querySelector("#loading").hidden, null, { timeout: 25_000 });
    assert.deepEqual(errors, [], `unexpected page errors: ${errors.join("; ")}`);
    await page.close();
    return;
  }
  await page.waitForFunction(() => document.querySelector("#loading").hidden, null, { timeout: 25_000 });
  await page.waitForFunction(() => Number(document.documentElement.dataset.doomFrameLuminance) > 2, null, { timeout: 10_000 });
  const before = await page.locator("#doom-canvas").screenshot();
  await page.keyboard.down("w");
  await page.waitForTimeout(500);
  await page.keyboard.up("w");
  await page.mouse.click(640, 360);
  await page.mouse.move(690, 360);
  await page.waitForTimeout(800);
  const after = await page.locator("#doom-canvas").screenshot();
  assert.notDeepEqual(after, before, "the engine canvas should render changing frames");
  if (process.env.DOOM_E2E_RESET !== "0") {
    await page.getByRole("button", { name: "RESET MATCH" }).click();
    await page.waitForFunction(() => document.querySelector("#loading").hidden, null, { timeout: 25_000 });
  }
  assert.deepEqual(errors, [], `unexpected page errors: ${errors.join("; ")}`);
  await page.close();
}

async function mobile(browser) {
  const landscape = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
  const landscapePage = await landscape.newPage();
  await landscapePage.goto(baseURL, { waitUntil: "networkidle" });
  assert.equal(await landscapePage.locator("#touch-controls").evaluate((el) => getComputedStyle(el).display), "block");
  assert.equal(await landscapePage.locator("#rotate").isHidden(), true);
  await landscape.close();

  const portrait = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const portraitPage = await portrait.newPage();
  await portraitPage.goto(baseURL, { waitUntil: "networkidle" });
  assert.equal(await portraitPage.locator("#rotate").isVisible(), true);
  await portrait.close();
}

(async () => {
  const browser = await chromium.launch({ executablePath, headless: true, args: ["--use-gl=angle", "--use-angle=swiftshader"] });
  const mode = process.env.DOOM_E2E_MODE || "all";
  try {
    if (mode === "all" || mode === "desktop") await desktop(browser);
    if (mode === "all" || mode === "mobile") await mobile(browser);
  }
  finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
