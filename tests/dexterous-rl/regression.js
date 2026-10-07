import loadMujoco from "../../assets/interactive/dexterous-rl/runtime/mujoco.js";
import { Observation, applyAction, angle } from "../../assets/interactive/dexterous-rl/control.js";
import { loadPolicy } from "../../assets/interactive/dexterous-rl/policy.js";
const base = new URL("../../assets/interactive/dexterous-rl/", import.meta.url);
const output = document.querySelector("#output");
async function json(p) {
  return (await fetch(new URL(p, base))).json();
}
const print = (x) => {
  output.textContent += JSON.stringify(x, null, 2) + "\n";
};
document.querySelector("#run").onclick = async () => {
  document.querySelector("#run").disabled = true;
  output.textContent = "Running…\n";
  try {
    const start = performance.now();
    const [mj, actor, c, manifest, vectors] = await Promise.all([
      loadMujoco(),
      loadPolicy(),
      json("config.json"),
      json("manifest.json"),
      json("golden.json"),
    ]);
    mj.FS.mkdir("/hand");
    mj.FS.mkdir("/hand/meshes");
    mj.FS.mkdir("/hand/textures");
    await Promise.all(
      manifest
        .filter((p) => !["policy.onnx", "config.json"].includes(p))
        .map(async (p) => mj.FS.writeFile("/hand/" + p, new Uint8Array(await (await fetch(new URL(p, base))).arrayBuffer())))
    );
    const m = mj.MjModel.from_xml_path("/hand/scene.xml"),
      d = new mj.MjData(m),
      obs = new Observation(c);
    let maxAction = 0,
      maxObs = 0,
      maxTarget = 0,
      maxPhysics = 0;
    let inferenceTotal = 0,
      physicsTotal = 0,
      n = 0;
    for (const v of vectors) {
      const a = await actor(Float32Array.from(v.observation));
      a.forEach((x, i) => (maxAction = Math.max(maxAction, Math.abs(x - v.action[i]))));
      obs.reset();
      obs.buffers = v.histories.map((h) => [Float32Array.from(h[0]), Float32Array.from(h[0]), Float32Array.from(h[1])]);
      const o = obs.build(v.qpos, v.site_xpos, v.site_xmat, v.prev_target, v.goal, v.last_action);
      o.forEach((x, i) => (maxObs = Math.max(maxObs, Math.abs(x - v.observation[i]))));
      const target = applyAction(c, v.action, v.prev_target, v.step);
      target.forEach((x, i) => (maxTarget = Math.max(maxTarget, Math.abs(x - v.target[i]))));
      mj.mj_resetData(m, d);
      d.qpos.set(v.qpos);
      d.qvel.set(v.qvel);
      c.ctrl_ids.forEach((id, i) => (d.ctrl[id] = target[i]));
      mj.mj_forward(m, d);
      d.qacc_warmstart.set(v.warmstart);
      for (let i = 0; i < c.n_substeps; i++) mj.mj_step(m, d);
      d.qpos.forEach((x, i) => (maxPhysics = Math.max(maxPhysics, Math.abs(x - v.next_qpos[i]))));
    }
    print({ goldenVectors: vectors.length, maxAction, maxObs, maxTarget, maxPhysics, engine: mj.mj_versionString() });
    if (maxAction > 1e-4 || maxObs > 2e-6 || maxTarget > 1e-10 || maxPhysics > 1e-4) throw Error("Golden parity tolerance exceeded");
    const native = await (await fetch("../../projects/dexterous-rl/results/native-evaluation.json")).json();
    const trials = [];
    for (const t of native) {
      mj.mj_resetData(m, d);
      d.qpos.set(c.initial_qpos);
      d.ctrl.set(c.initial_ctrl);
      mj.mj_forward(m, d);
      obs.reset();
      let prev = c.default_joint_pos.slice(),
        action = new Float32Array(20),
        minError = 180,
        minZ = 1;
      let held = 0,
        reached = false;
      for (let step = 0; step < 280; step++) {
        const o = obs.build(
          d.qpos,
          d.site_xpos.subarray(c.tag_site * 3, c.tag_site * 3 + 3),
          d.site_xmat.subarray(c.tag_site * 9, c.tag_site * 9 + 9),
          prev,
          t.goal,
          action
        );
        let now = performance.now();
        action = await actor(o);
        inferenceTotal += performance.now() - now;
        n++;
        prev = applyAction(c, action, prev, step);
        c.ctrl_ids.forEach((id, i) => (d.ctrl[id] = prev[i]));
        now = performance.now();
        for (let j = 0; j < c.n_substeps; j++) mj.mj_step(m, d);
        physicsTotal += performance.now() - now;
        const error = angle(Array.from(d.qpos.slice(c.cube_qadr + 3, c.cube_qadr + 7)), t.goal);
        minError = Math.min(minError, error);
        minZ = Math.min(minZ, d.qpos[c.cube_qadr + 2]);
        held = error < 11.46 ? held + 1 : 0;
        if (held >= 5) reached = true;
      }
      trials.push({ trial: t.trial, minError, finalError: angle(Array.from(d.qpos.slice(c.cube_qadr + 3, c.cube_qadr + 7)), t.goal), minZ, reached });
      print(trials.at(-1));
    }
    // Change a goal before the previous turn has converged, without resetting.
    mj.mj_resetData(m, d);
    d.qpos.set(c.initial_qpos); d.ctrl.set(c.initial_ctrl); mj.mj_forward(m, d);
    obs.reset();
    let dynamicPrev = c.default_joint_pos.slice(), dynamicAction = new Float32Array(20);
    let dynamicGoal = native[0].goal, dynamicMinZ = 1, recoveryHeld = 0;
    const phaseErrors = [];
    for (let step = 0; step < 880; step++) {
      if (step === 280) dynamicGoal = native[1].goal;
      if (step === 300) dynamicGoal = native[2].goal;
      if (step === 600) {
        const adr = m.body_dofadr[c.cube_body];
        [0.03, 0.02, -0.02, 1, 0.3, -0.5].forEach((v, i) => d.qvel[adr+i] += v);
      }
      const o = obs.build(d.qpos, d.site_xpos.subarray(c.tag_site*3,c.tag_site*3+3), d.site_xmat.subarray(c.tag_site*9,c.tag_site*9+9), dynamicPrev, dynamicGoal, dynamicAction);
      dynamicAction = await actor(o);
      dynamicPrev = applyAction(c, dynamicAction, dynamicPrev, step);
      c.ctrl_ids.forEach((id,i) => d.ctrl[id] = dynamicPrev[i]);
      for (let j=0;j<c.n_substeps;j++) mj.mj_step(m,d);
      dynamicMinZ = Math.min(dynamicMinZ,d.qpos[c.cube_qadr+2]);
      const e = angle(Array.from(d.qpos.slice(c.cube_qadr+3,c.cube_qadr+7)),dynamicGoal);
      if ([279,299,599,600,879].includes(step)) phaseErrors.push({step,error:e});
      if(step>=600) recoveryHeld = e < 11.46 ? recoveryHeld+1 : 0;
    }
    const dynamic = {minZ:dynamicMinZ, recoveryHeld, phaseErrors, passed:dynamicMinZ>.4099 && recoveryHeld>=5};
    print({dynamic});
    const result = {
      passed: trials.every((t) => t.reached && t.minZ > 0.4099) && dynamic.passed,
      dynamic,
      golden: { maxAction, maxObs, maxTarget, maxPhysics },
      trials,
      meanInferenceMs: inferenceTotal / n,
      meanPhysicsPerControlMs: physicsTotal / n,
      totalWallSeconds: (performance.now() - start) / 1000,
    };
    print(result);
    if (!result.passed) throw Error("Closed loop regression failed");
    print("PASS");
  } catch (e) {
    print({ error: e.message });
    console.error(e);
  } finally {
    document.querySelector("#run").disabled = false;
  }
};
