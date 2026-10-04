const { chromium } = require("playwright");
const assert = require("node:assert/strict"),
  fs = require("node:fs");
const URL = process.env.GAME_URL || "http://127.0.0.1:8097/assets/interactive/block-world/index.html?debug=1";
(async () => {
  fs.mkdirSync("artifacts/browser", { recursive: true });
  const results = {};
  for (const profile of ["desktop", "phone"]) {
    const phone = profile === "phone";
    const browser = await chromium.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--use-gl=angle",
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
        "--disable-background-timer-throttling",
        "--disable-renderer-backgrounding",
      ],
    });
    const context = await browser.newContext({
      viewport: phone ? { width: 844, height: 390 } : { width: 1280, height: 720 },
      hasTouch: phone,
      isMobile: phone,
      deviceScaleFactor: 1,
    });
    const page = await context.newPage(),
      errors = [];
    page.setDefaultTimeout(45000);
    page.setDefaultNavigationTimeout(45000);
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error" && !m.text().includes("favicon")) errors.push(m.text());
    });
    const state = () => page.evaluate(() => window.robotWorldState);
    const wait = async () => {
      await page.waitForTimeout(350);
    };
    async function load() {
      await page.locator("#play").click();
      await page.waitForFunction(() => window.robotWorldState?.loading === false, null, { timeout: 90000 });
      await page.locator("#play").click();
      await page.waitForFunction(() => window.robotWorldState?.active);
      await wait();
    }
    await page.goto(URL);
    await load();
    console.log(profile, "loaded", await state());
    assert.equal((await state()).robots, 12);
    assert.equal((await state()).chunks, 36);
    await page.waitForFunction(() => window.robotWorldState?.grounded, null, { timeout: 15000 });
    const initial = await state();
    const cdp = await context.newCDPSession(page);
    const tp = (id, x, y) => ({ id, x, y, radiusX: 5, radiusY: 5, force: 1 });
    async function touch(type, points) {
      await cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points });
    }
    async function lookDown() {
      if (phone) {
        await touch("touchStart", [tp(2, 570, 110)]);
        await touch("touchMove", [tp(2, 570, 270)]);
        await touch("touchEnd", []);
      } else {
        await page.mouse.move(800, 230);
        await page.mouse.down();
        await page.mouse.move(800, 390, { steps: 8 });
        await page.mouse.up();
      }
      await wait();
    }
    if (phone) {
      await touch("touchStart", [tp(1, 100, 220)]);
      await touch("touchMove", [tp(1, 100, 180)]);
      await touch("touchStart", [tp(1, 100, 180), tp(2, 570, 150)]);
      await touch("touchMove", [tp(1, 100, 180), tp(2, 590, 170)]);
      await page.waitForFunction((z) => window.robotWorldState?.position[2] < z - 0.8, initial.position[2]);
      const during = await state();
      assert(during.position[2] < initial.position[2] - 0.8, "joystick moves during camera drag");
      assert(Math.abs(during.yaw - initial.yaw) > 0.04, "second finger rotates camera");
      const jumpBox = await page.locator("#jump").boundingBox();
      await touch("touchStart", [tp(1, 100, 180), tp(2, 590, 170), tp(3, jumpBox.x + jumpBox.width / 2, jumpBox.y + jumpBox.height / 2)]);
      await page.waitForFunction((y) => window.robotWorldState?.position[1] > y + 0.3, initial.position[1]);
      await touch("touchEnd", []);
      await page.waitForTimeout(800);
      const stop = await state();
      await page.waitForTimeout(500);
      assert(Math.abs((await state()).position[2] - stop.position[2]) < 0.1, "joystick release stops movement");
    } else {
      await page.keyboard.down("w");
      await page.waitForFunction((z) => window.robotWorldState?.position[2] < z - 1, initial.position[2]);
      await page.keyboard.up("w");
      await wait();
      await page.keyboard.press("Space");
      await page.waitForFunction((y) => window.robotWorldState?.position[1] > y + 0.3, initial.position[1]);
      await page.waitForFunction(() => window.robotWorldState?.grounded);
    }
    console.log(profile, "movement/jump passed", await state());
    await lookDown();
    console.log(profile, "aimed", await state());
    await page.waitForFunction(() => !!window.robotWorldState?.target);
    const before = await state();
    await page.locator("#break").click();
    await page.waitForFunction((n) => window.robotWorldState?.broken > n, before.broken || 0);
    assert((await state()).changes > 0, "break creates save delta");
    console.log(profile, "break passed");
    await page.locator('#hotbar [aria-label="Brick"]').click();
    await wait();
    assert.equal((await state()).selected, 7);
    await page.locator("#place").click();
    await page.waitForFunction((n) => window.robotWorldState?.placed > n, before.placed || 0);
    await page.locator('#hotbar [aria-label="Open block palette"]').click();
    await page.locator('#palette [aria-label="Core"]').click();
    await wait();
    assert.equal((await state()).selected, 12);
    assert.equal(await page.locator('#hotbar [aria-label="Core"]').getAttribute("aria-pressed"), "true");
    const pitchBefore = (await state()).pitch;
    await page.locator("#jump").click();
    await wait();
    assert(Math.abs((await state()).pitch - pitchBefore) < 0.001, "action buttons do not turn camera");
    await page.waitForTimeout(600);
    await page.locator("#wave").click();
    await wait();
    const retained = await state();
    console.log(profile, "editing passed", retained);
    await page.locator("#pause").click();
    await page.waitForFunction(() => !window.robotWorldState?.active);
    await page.locator("#reset").click();
    await page.locator("#cancel-reset").click();
    assert.equal((await state()).changes, retained.changes, "cancel reset keeps edits");
    await page.reload();
    await load();
    assert.equal((await state()).changes, retained.changes, "edits survive refresh");
    assert.equal((await state()).selected, 12, "selected block survives refresh");
    // Layout and real browser fullscreen from a user input event.
    const boxes = await page
      .locator("#hud button:visible")
      .evaluateAll((bs) => bs.map((b) => ({ name: b.getAttribute("aria-label") || b.textContent, r: b.getBoundingClientRect().toJSON() })));
    for (const b of boxes) {
      assert(b.r.width >= 44 && b.r.height >= 44, `${b.name} has 44px touch target`);
      assert(b.r.left >= 0 && b.r.right <= page.viewportSize().width, `${b.name} is on screen`);
    }
    await page.locator("#fullscreen").click();
    await page.waitForTimeout(400);
    const full = await page.evaluate(() => !!document.fullscreenElement);
    assert(full, "fullscreen button enters fullscreen");
    await page.locator("#fullscreen").click();
    await wait();
    assert(!(await page.evaluate(() => !!document.fullscreenElement)), "fullscreen can exit");
    if (phone) {
      await page.setViewportSize({ width: 390, height: 844 });
      await wait();
      assert(await page.locator("#rotate").isVisible(), "portrait asks to rotate");
      assert.equal(await page.evaluate(() => window.scrollY), 0);
      await page.setViewportSize({ width: 667, height: 375 });
      await wait();
      await page.locator("#play").click();
      await wait();
      const hotbar = await page.locator("#hotbar").boundingBox();
      assert(hotbar.x >= 0 && hotbar.x + hotbar.width <= 667, "small landscape hotbar fits");
      await page.screenshot({ path: "artifacts/browser/phone-small.png" });
      await page.setViewportSize({ width: 844, height: 390 });
      await wait();
    }
    await page.screenshot({ path: `artifacts/browser/${profile}.png` });
    await page.locator("#pause").click();
    await page.locator("#reset").click();
    await page.locator("#confirm-reset").click();
    await page.waitForFunction(() => window.robotWorldState?.loading === false && window.robotWorldState?.changes === 0, null, { timeout: 90000 });
    assert.equal((await state()).robots, 12, "reset respawns robots");
    assert.equal(errors.length, 0, errors.join("\n"));
    results[profile] = {
      initial,
      final: await state(),
      fullscreen: full,
      errors,
      checks: [
        "movement",
        "jump",
        "break",
        "place",
        "palette",
        "button input isolation",
        "refresh persistence",
        "reset cancel/confirm",
        "fullscreen",
        "touch targets",
        ...(phone ? ["simultaneous 3-finger movement/look/jump", "portrait", "small landscape", "no page scroll"] : []),
      ],
    };
    await browser.close();
  }
  fs.writeFileSync("artifacts/browser/results.json", JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
