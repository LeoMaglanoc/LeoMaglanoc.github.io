const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage({ ignoreHTTPSErrors: true });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(process.env.G1_URL);
  await page.waitForFunction(() => document.querySelector("#g1-loading").hidden, {}, { timeout: 120000 });
  await page.waitForTimeout(2000);
  console.log(
    JSON.stringify({ status: await page.locator("#g1-status").textContent(), walkTime: await page.locator("#g1-walk-time").textContent(), errors })
  );
  if (errors.length) throw Error(errors.join(";"));
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
