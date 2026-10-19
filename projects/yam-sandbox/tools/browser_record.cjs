const { chromium } = require("playwright"),
  fs = require("fs"),
  cp = require("child_process");
(async () => {
  const b = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--enable-unsafe-swiftshader",
    ],
  });
  for (const obj of ["cube", "cylinder"]) {
    const page = await b.newPage({ viewport: { width: 1000, height: 700 } });
    await page.goto(
      process.env.YAM_URL ||
        "http://localhost:8000/assets/interactive/yam-sandbox/index.html",
    );
    await page.waitForFunction(() => window.yam, null, { timeout: 60000 });
    await page.selectOption("#task", obj);
    const cdp = await page.context().newCDPSession(page),
      dir = require("path").join(require("os").tmpdir(), `yam-${obj}`);
    fs.mkdirSync(dir, { recursive: true });
    let entries = [];
    cdp.on("Page.screencastFrame", (ev) => {
      const file = `${dir}/${String(entries.length).padStart(6, "0")}.jpg`;
      fs.writeFileSync(file, Buffer.from(ev.data, "base64"));
      entries.push({ file, t: ev.metadata.timestamp });
      cdp
        .send("Page.screencastFrameAck", { sessionId: ev.sessionId })
        .catch(() => {});
    });
    await cdp.send("Page.startScreencast", {
      format: "jpeg",
      quality: 65,
      maxWidth: 1000,
      maxHeight: 700,
      everyNthFrame: 2,
    });
    await page.click("#run");
    await page.waitForFunction(
      () => window.yam.sim.controller?.terminal,
      null,
      { timeout: 180000 },
    );
    await page.waitForTimeout(400);
    await cdp.send("Page.stopScreencast");
    const result = await page.evaluate(() => yam.sim.controller.result());
    if (!result.success) throw Error(result.reason);
    fs.writeFileSync(
      `${dir}/frames.txt`,
      entries
        .map(
          (e, i) =>
            `file '${e.file}'\nduration ${i + 1 < entries.length ? Math.max(0.001, entries[i + 1].t - e.t) : 0.2}`,
        )
        .join("\n"),
    );
    cp.execFileSync(process.env.FFMPEG_PATH || "ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      `${dir}/frames.txt`,
      "-vf",
      "fps=15",
      "-c:v",
      "libvpx-vp9",
      "-b:v",
      "450k",
      require("path").resolve(
        __dirname,
        `../results/${obj}-screen-recording.webm`,
      ),
    ]);
    console.log(
      obj,
      "recorded",
      entries.length,
      "frames",
      entries.at(-1).t - entries[0].t,
      "seconds",
    );
    await page.close();
  }
  await b.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
