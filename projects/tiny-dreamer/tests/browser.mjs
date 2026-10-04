import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs";
const url =
  process.env.DREAMER_URL ||
  "http://localhost:4000/assets/interactive/tiny-dreamer/index.html";
fs.mkdirSync("artifacts", { recursive: true });
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const reports = {};
try {
  for (const mobile of [false, true]) {
    const context = await browser.newContext({
      viewport: mobile
        ? { width: 390, height: 844 }
        : { width: 1440, height: 900 },
      isMobile: mobile,
      hasTouch: mobile,
    });
    const page = await context.newPage();
    const errors = [],
      external = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (e) => {
      if (e.type() === "error") errors.push(e.text());
    });
    page.on("request", (r) => {
      if (new URL(r.url()).origin !== new URL(url).origin)
        external.push(r.url());
    });
    await page.goto(url);
    await page.waitForFunction(
      () =>
        window.tinyDreamer?.ready || !document.getElementById("error").hidden,
      {},
      { timeout: 60000 },
    );
    assert.equal(await page.locator("#error").isVisible(), false);
    await page.locator("#pause").click();
    await page.waitForTimeout(300);
    const parity = await page.evaluate(async () => {
      const { sim } = window.tinyDreamer;
      const trace = await (await fetch("models/reference_trace.json")).json();
      sim.reset();
      sim.data.qpos.set(trace.initial_qpos);
      sim.data.qvel.set(trace.initial_qvel);
      sim.mj.mj_forward(sim.model, sim.data);
      const errors = { qpos: 0, qvel: 0, observation: 0, reward: 0 };
      for (const s of trace.steps) {
        const obs = sim.step(s.action[0]);
        errors.reward = Math.max(
          errors.reward,
          Math.abs(sim.lastReward - s.reward),
        );
        for (const [k, actual] of [
          ["qpos", sim.data.qpos],
          ["qvel", sim.data.qvel],
          ["observation", obs],
        ]) {
          errors[k] = Math.max(
            errors[k],
            ...[...actual].map((v, i) => Math.abs(v - s[k][i])),
          );
        }
      }
      return { errors, version: sim.mj.mj_versionString() };
    });
    assert.ok(
      Object.values(parity.errors).every((v) => v < 2e-5),
      "native/WASM physics parity",
    );
    const inferenceParity = await page.evaluate(async () => {
      const { policy: p } = window.tinyDreamer;
      const fixtures = await (
        await fetch("models/inference_fixture.json")
      ).json();
      const errors = {};
      const flatten = (a) => a.flat(Infinity);
      for (const [name, f] of Object.entries(fixtures)) {
        const state = {
          h: Float32Array.from(flatten(f.inputs.h)),
          z: Float32Array.from(flatten(f.inputs.z)),
        };
        let actual;
        if (name === "actor") actual = { action: [await p.act(state)] };
        else if (name === "posterior") {
          const next = await p.observe(
            state,
            flatten(f.inputs.action)[0],
            Float32Array.from(flatten(f.inputs.observation)),
          );
          actual = { next_h: next.h, next_z: next.z };
        } else {
          const next = await p.imagine(state, flatten(f.inputs.action)[0]);
          actual = {
            next_h: next.state.h,
            next_z: next.state.z,
            decoded: next.observation,
            reward: [next.reward],
          };
        }
        errors[name] = Math.max(
          ...Object.entries(actual).flatMap(([k, a]) =>
            [...a].map((v, i) => Math.abs(v - flatten(f.outputs[k])[i])),
          ),
        );
      }
      return errors;
    });
    assert.ok(
      Object.values(inferenceParity).every((e) => e < 1e-5),
      "PyTorch/browser ONNX numerical parity",
    );
    const control = await page.evaluate(async () => {
      const d = window.tinyDreamer;
      d.reset();
      const returns = [],
        errors = [],
        actions = [];
      let upright = 0,
        run = 0,
        maxRun = 0;
      for (let i = 0; i < 200; i++) {
        await d.runner.step();
        const obs = d.sim.observation;
        returns.push(d.sim.lastReward);
        errors.push(d.runner.error);
        actions.push(d.sim.action);
        const up = obs[1] >= Math.cos((15 * Math.PI) / 180);
        upright += up;
        run = up ? run + 1 : 0;
        maxRun = Math.max(maxRun, run);
      }
      d.renderer.render(d.runner);
      return {
        time: d.sim.time,
        return: returns.reduce((s, v) => s + v, 0) * 5,
        upright_fraction: upright / 200,
        longest_upright_seconds: maxRun * 0.05,
        max_action: Math.max(...actions.map(Math.abs)),
        error_mean: errors.reduce((s, v) => s + v, 0) / errors.length,
        dream_length: d.runner.dream.length,
      };
    });
    assert.equal(control.time, 10);
    assert.ok(control.max_action <= 1 && control.dream_length === 15);
    // Performance assertion exercises the shipped deterministic browser policy.
    await page.screenshot({
      path: `artifacts/${mobile ? "mobile" : "desktop"}.png`,
    });
    console.log({ viewport: mobile ? "mobile" : "desktop", control });
    if (!process.env.DREAMER_SMOKE_ONLY) {
      assert.ok(
        control.return > 500 && control.longest_upright_seconds >= 2,
        "browser swing-up and balancing",
      );
    }
    const disturbanceDream = await page.evaluate(async () => {
      const d = window.tinyDreamer, r = d.runner, sim = d.sim;
      d.reset();
      for (let i = 0; i < 120; i++) await r.step();
      const snapshot = {
        qpos: [...sim.data.qpos], qvel: [...sim.data.qvel], steps: sim.steps,
        state: {h: r.state.h.slice(), z: r.state.z.slice()}, action: r.previousAction,
        dream: r.dream, dreamTime: r.dreamTime,
      };
      const restore = () => {
        sim.data.qpos.set(snapshot.qpos); sim.data.qvel.set(snapshot.qvel);
        sim.data.qfrc_applied.fill(0); sim.pushRemaining = 0;
        sim.steps = snapshot.steps;
        sim.mj.mj_forward(sim.model, sim.data);
        r.state = {h:snapshot.state.h.slice(),z:snapshot.state.z.slice()};
        r.previousAction = snapshot.action;
        r.dream = snapshot.dream;
        r.dreamTime = sim.time;
      };
      restore();
      await r.step();
      const baseline = r.error, prediction = [...r.previousPrediction];
      const pushed = [];
      for (const sign of [-1,1]) {
        restore();
        const oldDream = JSON.stringify(r.dream);
        sim.push(sign,5);
        await r.step();
        const changedPrediction = Math.max(...r.previousPrediction.map((v,i)=>Math.abs(v-prediction[i])));
        const pushError = r.error;
        const oldDreamPreserved = oldDream === JSON.stringify(r.dream);
        const recoveryErrors=[];
        for (let i=0;i<30;i++) {await r.step();recoveryErrors.push(r.error);}
        r.dreamTime = -Infinity;
        await r.step();
        pushed.push({pushError,changedPrediction,oldDreamPreserved,reanchored:oldDream!==JSON.stringify(r.dream),tailError:recoveryErrors.slice(-10).reduce((sum,v)=>sum+v,0)/10});
      }
      d.renderer.render(r);
      return {baseline,pushed};
    });
    assert.ok(disturbanceDream.pushed.every(p=>p.changedPrediction<1e-5 && p.oldDreamPreserved && p.reanchored),"unobserved force leaves old neural forecast intact; posterior observations reanchor a new dream");
    console.log({disturbanceDream});
    const worstPush = disturbanceDream.pushed.reduce((a,b)=>a.pushError>b.pushError?a:b);
    assert.ok(worstPush.pushError>disturbanceDream.baseline+.005,"disturbance makes the old forecast inaccurate");
    assert.ok(worstPush.tailError<worstPush.pushError,"new evidence reduces prediction error after force expires");
    await page.locator("#dream").click();
    assert.equal(
      await page.evaluate(() => window.tinyDreamer.runner.showDream),
      false,
    );
    await page.locator("#dream").click();
    for (const direction of [-1, 1]) {
      const delta = await page.evaluate((direction) => {
        const { sim } = window.tinyDreamer;
        sim.reset();
        for (let i = 0; i < 4; i++) sim.step(0);
        const baseline = [...sim.data.qvel];
        sim.reset();
        sim.push(direction);
        for (let i = 0; i < 4; i++) sim.step(0);
        return {
          velocity: sim.data.qvel[0] - baseline[0],
          remaining: sim.pushRemaining,
        };
      }, direction);
      assert.ok(
        delta.velocity * direction > 0.2,
        "physical push changes trajectory with motor held constant",
      );
      assert.ok(delta.remaining < 1e-9, "push expires");
      await page.locator(`[data-push="${direction}"]`).click();
      assert.equal(
        await page.evaluate(() => window.tinyDreamer.sim.pushForce),
        direction * 5,
      );
    }
    await page.locator("#reset").click();
    assert.equal(await page.evaluate(() => window.tinyDreamer.sim.time), 0);
    assert.equal(
      await page.evaluate(() => window.tinyDreamer.sim.pushRemaining),
      0,
    );
    const before = await page.evaluate(() => window.tinyDreamer.sim.time);
    await page.waitForTimeout(200);
    assert.equal(
      await page.evaluate(() => window.tinyDreamer.sim.time),
      before,
      "pause halts simulation",
    );
    await page.locator("#pause").click();
    await page.waitForTimeout(1000);
    assert.ok(
      (await page.evaluate(() => window.tinyDreamer.sim.time)) > 0.4,
      "animation advances physical time",
    );
    await page.locator("#pause").click();
    await page.waitForTimeout(300);
    // Reset while inference is pending: old posterior/action/dream must not leak.
    const resetRace = await page.evaluate(async () => {
      const d = window.tinyDreamer;
      const pending = d.runner.step();
      d.reset();
      await pending;
      return {
        time: d.sim.time,
        h: [...d.runner.state.h],
        action: d.runner.previousAction,
      };
    });
    assert.equal(resetRace.time, 0);
    assert.ok(resetRace.h.every((v) => v === 0) && resetRace.action === 0);
    const bounds = await page.evaluate(() => ({
      width: innerWidth,
      scroll: document.documentElement.scrollWidth,
      buttons: [...document.querySelectorAll("button")].map((b) => ({
        width: b.getBoundingClientRect().width,
        height: b.getBoundingClientRect().height,
      })),
    }));
    assert.ok(
      bounds.scroll <= bounds.width &&
        bounds.buttons.every((b) => b.width >= 44 && b.height >= 44),
    );
    if (mobile) {
      await page.setViewportSize({ width: 844, height: 390 });
      await page.waitForTimeout(100);
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      await page.screenshot({
        path: "artifacts/mobile-landscape.png",
        fullPage: true,
      });
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(external, [], "runtime requests stay local");
    reports[mobile ? "mobile" : "desktop"] = {
      parity,
      inferenceParity,
      control,
      disturbanceDream,
      errors,
      external_requests: external,
    };
    await context.close();
  }
  fs.writeFileSync(
    "artifacts/browser-results.json",
    JSON.stringify(reports, null, 2) + "\n",
  );
  console.log(JSON.stringify(reports, null, 2));
} finally {
  await browser.close();
}
