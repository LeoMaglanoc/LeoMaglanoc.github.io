import { loadModel } from "./model.js";
import { createView } from "./renderer.js";
import { loadAsset } from "./assets.js";
const $ = (s) => document.querySelector(s),
  buttons = ["#start", "#reset", "#new-layout", "#replay"];
let state,
  view,
  renderModel,
  tool = "target",
  layoutIndex = 0,
  replaying = false,
  replayData,
  replayIndex = 0,
  replayStart = 0,
  replayTime = 0,
  replayPaused = false,
  aboutResume = false;
let dirty = false,
  lastDraw = 0;
let nextId = 0,
  pending = new Map(),
  ready = false,
  frames = 0,
  lastMeasure = performance.now(),
  lastSim = 0,
  perf = "";
const worker = new Worker(new URL("./worker.js", import.meta.url), {
  type: "module",
});
function request(type, extra = {}) {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    worker.postMessage({ type, id, ...extra });
  });
}
function error(message) {
  ready = false;
  buttons.forEach((s) => ($(s).disabled = true));
  $("#status").textContent = "Could not continue";
  $("#loading").hidden = false;
  $(".loader").hidden = true;
  $("#loading strong").textContent = "The experiment stopped";
  $("#loading-message").textContent = message;
  $("#retry").hidden = false;
  for (const { reject } of pending.values()) reject(Error(message));
  pending.clear();
}
worker.onerror = (e) =>
  error(
    e.message || "The simulation worker could not load. Reload to try again.",
  );
worker.onmessage = ({ data: m }) => {
  if (m.type === "reply") {
    pending.get(m.id)?.resolve(m.value);
    pending.delete(m.id);
  }
  if (m.type === "error") {
    if (m.id) {
      pending.get(m.id)?.reject(Error(m.message));
      pending.delete(m.id);
    }
    error(m.message);
  }
  if (m.type === "state" && !replaying) {
    if (
      !state ||
      state.running !== m.state.running ||
      m.state.time < state.time
    ) {
      lastMeasure = performance.now();
      lastSim = m.state.time;
      frames = 0;
      $("#performance").textContent = m.state.running
        ? "Measuring simulation speed…"
        : "Live physics · ready on your device";
    }
    state = m.state;
    dirty = true;
  }
  if (m.type === "ready") {
    $("#loading-message").textContent =
      `MuJoCo ${m.version} and both policies are ready. Preparing the view…`;
  }
};
const resultText = {
  success: "Target reached",
  fall: "Robot fell",
  ball_out_of_bounds: "Ball out of play",
  timeout: "Time is up",
};
function setContent(selector, property, value) {
  const element = $(selector);
  if (element[property] !== value) element[property] = value;
}
function applyState() {
  if (!state) return;
  if (replaying)
    setContent("#performance", "textContent", "Recorded native rollout");
  else if (!state.running)
    setContent(
      "#performance",
      "textContent",
      "Live physics · ready on your device",
    );
  if (renderModel) {
    const { mj, model, data } = renderModel;
    data.qpos.set(state.qpos);
    if (state.qvel) data.qvel.set(state.qvel);
    const mocap =
      model.body_mocapid[
        mj.mj_name2id(model, mj.mjtObj.mjOBJ_BODY.value, "target_marker")
      ];
    data.mocap_pos.set([...state.target, 0.002], mocap * 3);
    mj.mj_forward(model, data);
  }
  setContent("#time", "innerHTML", `${state.time.toFixed(1)}<small> s</small>`);
  const distance = Math.hypot(
    state.qpos[state.ballIndex] - state.target[0],
    state.qpos[state.ballIndex + 1] - state.target[1],
  );
  setContent(
    "#distance",
    "innerHTML",
    `${distance.toFixed(2)}<small> m</small>`,
  );
  setContent(
    "#status",
    "textContent",
    replaying
      ? state.result
        ? "Reference finished"
        : "Recorded native rollout"
      : state.result
        ? resultText[state.result]
        : state.running
          ? "Finding the next touch"
          : state.time
            ? "Attempt paused"
            : "Ready for a little football",
  );
  setContent(
    "#start",
    "innerHTML",
    replaying
      ? 'Return to live <span aria-hidden="true">↗</span>'
      : state.result
        ? "Attempt complete"
        : state.running
          ? 'Pause attempt <span aria-hidden="true">Ⅱ</span>'
          : state.time
            ? 'Resume dribbling <span aria-hidden="true">↗</span>'
            : 'Start dribbling <span aria-hidden="true">↗</span>',
  );
  $("#start").disabled = !ready || (!replaying && !!state.result);
  setContent("#reset", "textContent", replaying ? "Restart replay" : "Reset");
  setContent(
    "#new-layout",
    "textContent",
    replaying ? "Return to live" : "New layout",
  );
  setContent(
    "#replay",
    "textContent",
    replaying ? "Next reference" : "Watch reference",
  );
  setContent(
    "#layout-label",
    "textContent",
    replaying ? `Native seed ${state.seed}` : `Layout ${state.seed}`,
  );
  setContent(
    "#mode-badge",
    "textContent",
    replaying ? "RECORDED REPLAY" : "LIVE SIMULATION",
  );
  setContent(
    "#field-hint",
    "textContent",
    replaying
      ? "Recorded native rollout · return to live to edit."
      : state.running
        ? "The policies are in control."
        : state.result
          ? "Reset or try a new layout."
          : tool === "camera"
            ? "Drag to orbit · pinch or scroll to zoom."
            : `Tap the field to place the ${tool}.`,
  );
  if (view)
    view.controls.enabled = tool === "camera" || state.running || replaying;
  document
    .querySelectorAll("[data-tool]")
    .forEach((b) => (b.disabled = replaying));
  drawMap();
}
function drawMap() {
  if (!state) return;
  const c = $("#map"),
    ctx = c.getContext("2d"),
    w = c.width,
    h = c.height;
  const xy = (x, y) => [
    24 + ((x + 4) / 8) * (w - 48),
    24 + ((3 - y) / 6) * (h - 48),
  ];
  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = "#52745c";
  ctx.lineWidth = 2;
  ctx.strokeRect(24, 24, w - 48, h - 48);
  ctx.beginPath();
  ctx.moveTo(w / 2, 24);
  ctx.lineTo(w / 2, h - 24);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(w / 2, h / 2, ((w - 48) / 8) * 0.7, 0, Math.PI * 2);
  ctx.stroke();
  for (const sign of [-1, 1]) {
    const [x, y] = xy(sign === -1 ? -4 : 3.25, 1);
    ctx.strokeRect(x, y, ((w - 48) / 8) * 0.75, (h - 48) / 3);
  }
  const [tx, ty] = xy(...state.target);
  ctx.fillStyle = "#d3ef8824";
  ctx.strokeStyle = "#d3ef88";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(tx, ty, ((w - 48) / 8) * 0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(tx - 7, ty);
  ctx.lineTo(tx + 7, ty);
  ctx.moveTo(tx, ty - 7);
  ctx.lineTo(tx, ty + 7);
  ctx.stroke();
  const [bx, by] = xy(
    state.qpos[state.ballIndex],
    state.qpos[state.ballIndex + 1],
  );
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(bx, by, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#122721";
  ctx.lineWidth = 2;
  ctx.stroke();
  const [rx, ry] = xy(
      state.qpos[state.baseIndex],
      state.qpos[state.baseIndex + 1],
    ),
    [qw, qx, qy, qz] = state.qpos.slice(
      state.baseIndex + 3,
      state.baseIndex + 7,
    ),
    angle = -Math.atan2(2 * (qw * qz + qx * qy), 1 - 2 * (qy * qy + qz * qz));
  ctx.save();
  ctx.translate(rx, ry);
  ctx.rotate(angle);
  ctx.fillStyle = "#70b7d0";
  ctx.beginPath();
  ctx.moveTo(12, 0);
  ctx.lineTo(-8, -8);
  ctx.lineTo(-5, 0);
  ctx.lineTo(-8, 8);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
async function setTool(next) {
  tool = next;
  document
    .querySelectorAll("[data-tool]")
    .forEach((b) =>
      b.setAttribute("aria-pressed", String(b.dataset.tool === tool)),
    );
  applyState();
}
async function edit(x, y) {
  if (!ready || replaying || tool === "camera") return;
  if (state.running) {
    $("#setup-hint").textContent =
      "Pause the attempt before editing the setup.";
    return;
  }
  const response = await request("edit", { object: tool, x, y });
  $("#setup-hint").textContent = response?.accepted
    ? `${tool === "ball" ? "Ball" : "Target"} placed. Start to try this setup.`
    : response?.reason || "Choose a valid position.";
}
function attachField(canvas, pick) {
  let down;
  canvas.addEventListener("pointerdown", (e) => {
    if (!ready || tool === "camera" || replaying || state.running) return;
    down = { x: e.clientX, y: e.clientY };
    canvas.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  canvas.addEventListener("pointerup", (e) => {
    if (!down) return;
    const point = pick(e.clientX, e.clientY);
    down = null;
    if (point) edit(...point).catch((e) => error(e.message));
  });
  canvas.addEventListener("pointercancel", () => (down = null));
  canvas.addEventListener("keydown", (e) => {
    if (!ready || !state) return;
    if (
      ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key) &&
      !state?.running &&
      !replaying &&
      tool !== "camera"
    ) {
      e.preventDefault();
      const p =
        tool === "ball"
          ? state.qpos.slice(state.ballIndex, state.ballIndex + 2)
          : state.target.slice();
      p[0] += e.key === "ArrowRight" ? 0.2 : e.key === "ArrowLeft" ? -0.2 : 0;
      p[1] += e.key === "ArrowUp" ? 0.2 : e.key === "ArrowDown" ? -0.2 : 0;
      edit(...p).catch((e) => error(e.message));
    } else if (e.key === "Enter") {
      e.preventDefault();
      $("#start").click();
    }
  });
}
attachField($("#map"), (x, y) => {
  const r = $("#map").getBoundingClientRect();
  return [
    ((((x - r.left) / r.width) * 560 - 24) / (560 - 48)) * 8 - 4,
    3 - ((((y - r.top) / r.height) * 420 - 24) / (420 - 48)) * 6,
  ];
});
attachField($("#field"), (x, y) => view?.pick(x, y));
document
  .querySelectorAll("[data-tool]")
  .forEach((b) => (b.onclick = () => setTool(b.dataset.tool)));
$("#start").onclick = () => {
  if (replaying) return leaveReplay();
  request(state.running ? "pause" : "start").catch((e) => error(e.message));
};
$("#reset").onclick = () => {
  if (replaying) {
    replayTime = 0;
    replayStart = performance.now();
    return;
  }
  request("reset").catch((e) => error(e.message));
};
$("#new-layout").onclick = () => {
  if (replaying) return leaveReplay();
  layoutIndex++;
  request("layout", { index: layoutIndex }).catch((e) => error(e.message));
};
$("#camera-home").onclick = () => view?.home();
async function beginReplay(next = false) {
  await request("pause");
  if (!replayData)
    replayData = await loadAsset(
      new URL("../replays.json", import.meta.url),
      "native reference replay",
      (r) => r.json(),
    );
  if (next) replayIndex = (replayIndex + 1) % replayData.length;
  replaying = true;
  replayTime = 0;
  replayStart = performance.now();
  replayPaused = false;
}
async function leaveReplay() {
  replaying = false;
  await request("reset");
  lastMeasure = performance.now();
  lastSim = 0;
}
$("#replay").onclick = () =>
  beginReplay(replaying).catch((e) => error(e.message));
$("#about").onclick = async () => {
  aboutResume = state?.running && !replaying;
  await request("pause");
  if (replaying) {
    replayTime = Math.min(
      replayData[replayIndex].frames.length * 0.2,
      (performance.now() - replayStart) / 1000,
    );
    replayPaused = true;
  }
  $("#about-dialog").showModal();
};
$("#close-about").onclick = () => $("#about-dialog").close();
$("#about-dialog").addEventListener("close", () => {
  if (replaying) {
    replayStart = performance.now() - replayTime * 1000;
    replayPaused = false;
  } else if (aboutResume) request("start").catch((e) => error(e.message));
  aboutResume = false;
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden && ready) {
    request("pause").catch((e) => error(e.message));
    if (replaying) {
      replayTime = Math.min(
        replayData[replayIndex].frames.length * 0.2,
        (performance.now() - replayStart) / 1000,
      );
      replayPaused = true;
    }
  } else if (replaying) {
    replayStart = performance.now() - replayTime * 1000;
    replayPaused = false;
  }
});
function updateReplay(now) {
  const r = replayData[replayIndex],
    // A queued animation callback can have an older timestamp than a click.
    // Clamp before indexing frames when replay starts between those events.
    t = Math.max(
      0,
      replayPaused
        ? replayTime
        : Math.min(r.frames.length * 0.2, (now - replayStart) / 1000),
    ),
    position = t / 0.2,
    index = Math.floor(position),
    fraction = position - index;
  const a =
      index === 0
        ? r.initial.qpos
        : r.frames[Math.min(index - 1, r.frames.length - 1)],
    b = r.frames[Math.min(index, r.frames.length - 1)];
  const q = a.map((v, i) => v + (b[i] - v) * fraction);
  // Both floating joints store unit quaternions; normalize interpolated replay values.
  for (const start of [3, 22]) {
    const norm = Math.hypot(...q.slice(start, start + 4));
    for (let j = 0; j < 4; j++) q[start + j] /= norm;
  }
  state = {
    qpos: q,
    target: r.initial.target[0].slice(0, 2),
    time: t,
    seed: r.seed,
    ballIndex: 19,
    baseIndex: 0,
    result: t >= r.frames.length * 0.2 ? r.result.outcome : null,
    running: false,
  };
  applyState();
}
function frame(now) {
  if (!ready) return;
  if (now - lastDraw < 50) {
    requestAnimationFrame(frame);
    return;
  }
  lastDraw = now;
  if (dirty) {
    applyState();
    dirty = false;
  }
  if (replaying) updateReplay(now);
  view.update();
  frames++;
  if (now - lastMeasure > 1000) {
    const elapsed = (now - lastMeasure) / 1000,
      simElapsed = Math.max(0, state.time - lastSim);
    perf = replaying
      ? "Recorded native rollout"
      : state.running
        ? `${(simElapsed / elapsed).toFixed(2)}× real time · ${Math.round(
            frames / elapsed,
          )} fps`
        : "Live physics · ready on your device";
    $("#performance").textContent = perf;
    lastMeasure = now;
    lastSim = state.time;
    frames = 0;
  }
  requestAnimationFrame(frame);
}
const watchdog = setTimeout(() => {
  $("#loading-message").textContent =
    "The first load is taking longer than usual. Robot meshes and WASM are still loading; you can reload if the connection has stalled.";
  $("#retry").hidden = false;
}, 45000);
async function boot() {
  try {
    const loaded = await Promise.all([
      loadModel(),
      loadAsset(
        new URL("../display-meshes.json", import.meta.url),
        "display meshes",
        (r) => r.json(),
      ),
      request("init"),
    ]);
    renderModel = loaded[0];
    view = createView($("#field"), renderModel, loaded[1]);
    ready = true;
    applyState();
    buttons.forEach((s) => ($(s).disabled = false));
    applyState();
    $("#loading").hidden = true;
    clearTimeout(watchdog);
    requestAnimationFrame(frame);
    $("#field").addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
      request("pause");
      error(
        "The graphics context was lost. Reload the demo to restore the view.",
      );
    });
    if (new URLSearchParams(location.search).has("debug"))
      window.soccerLab = {
        request,
        get state() {
          return state;
        },
        view,
        renderModel,
        worker,
      };
  } catch (e) {
    clearTimeout(watchdog);
    error(e.message);
  }
}
boot();
