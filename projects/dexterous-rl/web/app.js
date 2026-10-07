import loadMujoco from "./runtime/mujoco.js";
import { Observation, applyAction, randomGoal, angle } from "./control.js";
import { loadPolicy } from "./policy.js";
import { HandRenderer } from "./renderer.js";
const $ = (id) => document.getElementById(id);
let goal = [1, 0, 0, 0],
  paused = false,
  dropped = false,
  ready = false,
  steps = 0,
  last = 0,
  acc = 0,
  busy = false,
  frames = 0,
  renderStart = performance.now(),
  simStart = 0,
  epoch = 0,
  latency = 0;
let m, d, mj, c, actor, obs, prev, action, renderer;
const history = [];
let hold = 0,
  metricTime = 0,
  renderMs = 0,
  physicsMs = 0,
  clockTime = 0;
async function json(path) {
  const r = await fetch(new URL(path, import.meta.url));
  if (!r.ok) throw Error(`${path}: HTTP ${r.status}`);
  return r.json();
}
function status(text) {
  $("status").textContent = text;
}
function reset() {
  epoch++;
  mj.mj_resetData(m, d);
  d.qpos.set(c.initial_qpos);
  d.ctrl.set(c.initial_ctrl);
  mj.mj_forward(m, d);
  obs.reset();
  prev = c.default_joint_pos.slice();
  action = new Float32Array(20);
  steps = 0;
  acc = 0;
  dropped = false;
  hold = 0;
  history.length = 0;
  simStart = performance.now();
  $("drop").hidden = true;
  $("time").textContent = "0.00 s";
  status(paused ? "Paused" : "Live · goal-conditioned RL");
}
function changeGoal(q) {
  goal = q;
  hold = 0;
}
function controls() {
  $("random").onclick = () => changeGoal(randomGoal());
  $("reset").onclick = reset;
  $("push").onclick = () => {
    if (!dropped) {
      const offset = m.body_dofadr[c.cube_body];
      for (let i = 0; i < 3; i++) d.qvel[offset + i] += (Math.random() - 0.5) * 0.12;
      for (let i = 3; i < 6; i++) d.qvel[offset + i] += (Math.random() - 0.5) * 2;
    }
  };
  $("pause").onclick = () => {
    paused = !paused;
    acc = 0;
    simStart = performance.now() - steps * c.ctrl_dt * 1000;
    $("pause").innerHTML = paused ? "Resume <span>▶</span>" : "Pause <span>Ⅱ</span>";
    status(paused ? "Paused" : dropped ? "Cube dropped" : "Live · goal-conditioned RL");
  };
  let drag = null;
  const t = $("target");
  t.addEventListener("pointerdown", (e) => {
    if (!ready) return;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
    t.setPointerCapture(e.pointerId);
  });
  t.addEventListener("pointermove", (e) => {
    if (!drag || drag.id !== e.pointerId) return;
    changeGoal(renderer.rotateGoal(goal, e.clientX - drag.x, e.clientY - drag.y));
    drag.x = e.clientX;
    drag.y = e.clientY;
    e.preventDefault();
  });
  const end = (e) => {
    if (drag?.id === e.pointerId) drag = null;
  };
  t.addEventListener("pointerup", end);
  t.addEventListener("pointercancel", end);
  t.addEventListener("lostpointercapture", () => (drag = null));
  t.addEventListener("keydown", (e) => {
    if (!ready) return;
    const delta = { ArrowLeft: [-8, 0], ArrowRight: [8, 0], ArrowUp: [0, -8], ArrowDown: [0, 8] }[e.key];
    if (delta) {
      e.preventDefault();
      changeGoal(renderer.rotateGoal(goal, ...delta));
    }
  });
  document.addEventListener("visibilitychange", () => {
    last = 0;
    acc = 0;
  });
}
async function regression() {
  const vectors = await json("./golden.json");
  let maxAction = 0,
    maxObs = 0;
  for (const v of vectors) {
    const predicted = await actor(Float32Array.from(v.observation));
    v.action.forEach((a, i) => (maxAction = Math.max(maxAction, Math.abs(a - predicted[i]))));
    obs.reset();
    obs.buffers = v.histories.map((h) => [Float32Array.from(h[0]), Float32Array.from(h[0]), Float32Array.from(h[1])]);
    const actual = obs.build(v.qpos, v.site_xpos, v.site_xmat, v.prev_target, v.goal, v.last_action);
    v.observation.forEach((x, i) => (maxObs = Math.max(maxObs, Math.abs(x - actual[i]))));
  }
  if (maxAction > 1e-4 || maxObs > 2e-6) throw Error(`Policy parity failed (${maxAction}, ${maxObs})`);
  $("parity").textContent = `${vectors.length} passed · ${maxAction.toExponential(1)}`;
  return { vectors: vectors.length, maxAction, maxObs };
}
async function tick() {
  const token = epoch;
  busy = true;
  try {
    const observation = obs.build(
      d.qpos,
      d.site_xpos.subarray(c.tag_site * 3, c.tag_site * 3 + 3),
      d.site_xmat.subarray(c.tag_site * 9, c.tag_site * 9 + 9),
      prev,
      goal,
      action
    );
    const start = performance.now(),
      next = await actor(observation);
    latency = performance.now() - start;
    if (token !== epoch) return;
    action = next;
    prev = applyAction(c, action, prev, steps);
    c.ctrl_ids.forEach((id, i) => (d.ctrl[id] = prev[i]));
    const physicsStart = performance.now();
    for (let i = 0; i < c.n_substeps; i++) mj.mj_step(m, d);
    physicsMs = performance.now() - physicsStart;
    steps++;
    hold = angle(Array.from(d.qpos.slice(c.cube_qadr + 3, c.cube_qadr + 7)), goal) < 11.46 ? hold + 1 : 0;
    if (!Number.isFinite(d.qpos[c.cube_qadr + 2])) throw Error("Physics became non-finite. Reload to retry.");
    if (d.qpos[c.cube_qadr + 2] < c.initial_qpos[c.cube_qadr + 2] - 0.15) {
      dropped = true;
      $("drop").hidden = false;
      status("Cube dropped · reset to retry");
    }
  } catch (e) {
    paused = true;
    status("Simulation stopped");
    $("loading").hidden = false;
    $("loading").textContent = e.message;
    console.error(e);
  } finally {
    busy = false;
  }
}
async function controlClock() {
  const now = performance.now(),
    elapsed = clockTime ? Math.min(0.1, (now - clockTime) / 1000) : 0;
  clockTime = now;
  if (ready && !paused && !dropped && !document.hidden) {
    acc = Math.min(acc + elapsed, 0.15);
    if (acc >= c.ctrl_dt && !busy) {
      acc -= c.ctrl_dt;
      await tick();
    }
  } else acc = 0;
  setTimeout(controlClock, Math.max(1, (c.ctrl_dt - acc) * 1000 - 2));
}
function frame(now) {
  requestAnimationFrame(frame);
  if (!ready) return;
  const renderT = performance.now();
  renderer.update(d, goal);
  renderMs = performance.now() - renderT;
  frames++;
  const error = angle(Array.from(d.qpos.slice(c.cube_qadr + 3, c.cube_qadr + 7)), goal);
  if (now - metricTime > 100) {
    metricTime = now;
    $("error").textContent = `${error.toFixed(0)}°`;
    $("error-bar").style.width = `${Math.max(0, 100 - error / 1.8)}%`;
    $("target").setAttribute("aria-valuenow", error.toFixed(0));
    $("target").setAttribute("aria-valuetext", `${error.toFixed(0)} degrees orientation error`);
    $("tracking").textContent = dropped ? "Dropped" : paused ? "Paused" : hold >= 5 ? "Target reached" : "Tracking";
    history.push(error);
    if (history.length > 100) history.shift();
    $("trace").setAttribute("d", history.map((e, i) => `${i ? "L" : "M"}${(i * 260) / 99},${31 - (e / 180) * 30}`).join(" "));
    $("latency").textContent = `${latency.toFixed(2)} ms`;
    $("cost").textContent = `${physicsMs.toFixed(1)} / ${renderMs.toFixed(1)} ms`;
    $("time").textContent = `${(steps * c.ctrl_dt).toFixed(2)} s`;
    const wall = (now - simStart) / 1000;
    $("pace").textContent = `${((steps * c.ctrl_dt) / Math.max(0.01, wall)).toFixed(2)}× real time`;
  }
  if (now - renderStart > 1000) {
    $("fps").textContent = `${Math.round((frames * 1000) / (now - renderStart))} fps`;
    frames = 0;
    renderStart = now;
  }
}
controls();
(async () => {
  try {
    c = await json("./config.json");
    status("Loading MuJoCo & actor");
    [mj, actor] = await Promise.all([loadMujoco(), loadPolicy()]);
    const manifest = await json("./manifest.json");
    mj.FS.mkdir("/hand");
    mj.FS.mkdir("/hand/meshes");
    mj.FS.mkdir("/hand/textures");
    await Promise.all(
      manifest
        .filter((p) => p !== "policy.onnx" && p !== "config.json")
        .map(async (p) => {
          const response = await fetch(new URL(p, import.meta.url));
          if (!response.ok) throw Error(`Missing asset: ${p}`);
          mj.FS.writeFile("/hand/" + p, new Uint8Array(await response.arrayBuffer()));
        })
    );
    m = mj.MjModel.from_xml_path("/hand/scene.xml");
    d = new mj.MjData(m);
    obs = new Observation(c);
    const parity = await regression();
    console.info("Wuji policy golden regression", parity);
    renderer = new HandRenderer($("scene"), $("target"));
    renderer.build(m, c);
    reset();
    ready = true;
    for (const id of ["random", "push", "reset", "pause"]) $(id).disabled = false;
    $("loading").hidden = true;
    void controlClock();
    requestAnimationFrame(frame);
  } catch (e) {
    status("Could not start");
    $("loading").textContent = `${e.message} Reload to retry.`;
    console.error(e);
  }
})();
