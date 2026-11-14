import { createScene, coverage, clip } from "./physics.js";
import { renderSensor } from "./raster.js";
import { masks, history } from "./observation.js";
import { Renderer } from "./renderer.js";
const $ = (id) => document.getElementById(id),
  renderer = new Renderer($("scene"));
let seed = 902005,
  scene,
  previous,
  current,
  plan = null,
  pending = null,
  worker = null,
  ready = false,
  running = false,
  busy = false,
  version = 0,
  count = 0,
  successStreak = 0,
  errors = [],
  timer = null,
  resetPlanner = true;
const status = (text) => {
  $("status").textContent = text;
};
function observe() {
  const pixels = renderSensor(scene.state().object, scene.state().agent);
  $("sensor")
    .getContext("2d")
    .putImageData(new ImageData(new Uint8ClampedArray(pixels), 64, 64), 0, 0);
  return masks(pixels);
}
function invalidate() {
  version++;
  busy = false;
  pending = null;
  plan = null;
  resetPlanner = true;
  clearTimeout(timer);
  $("execute").hidden = true;
}
function stop() {
  running = false;
  $("run").disabled = !ready;
  $("pause").disabled = true;
  clearTimeout(timer);
}
function reset() {
  stop();
  invalidate();
  scene = createScene(seed, $("difficulty").value);
  current = observe();
  previous = current;
  count = 0;
  successStreak = 0;
  errors = [];
  $("rotation").value = Math.round((scene.goal.angle * 180) / Math.PI);
  $("angle").textContent = $("rotation").value + "°";
  $("seed").textContent = "SEED " + seed;
  $("cost").textContent = "—";
  $("error").textContent = "—";
  $("latency").textContent = "—";
  $("stage-status").textContent = "Drag the green target to set a goal";
  status(ready ? "Ready · image-conditioned MPC" : "Loading neural models…");
  updateMetrics();
}
function updateMetrics() {
  const value = coverage(scene.state().object, scene.goal);
  $("coverage").innerHTML = Math.round(value * 100) + "<small>%</small>";
  $("progress").style.width = 100 * value + "%";
  $("actions").innerHTML = count + "<small> / 100</small>";
  return value;
}
function requestPlan() {
  if (!ready || busy || count >= 100) return;
  busy = true;
  status("Imagining candidate futures…");
  $("stage-status").textContent = "Searching in the learned world model";
  const goal = masks(renderSensor(scene.goal, null)).object;
  const token = version;
  worker.postMessage({
    type: "plan",
    version: token,
    observation: history(previous, current),
    goal,
    compute: $("compute").value,
    reset: resetPlanner,
  });
  resetPlanner = false;
  timer = setTimeout(() => {
    if (busy && token === version) {
      stop();
      invalidate();
      status("Planning timed out · safe no-op");
    }
  }, 15000);
}
function execute() {
  if (!pending) return;
  const selected = pending;
  pending = null;
  $("execute").hidden = true;
  const before = current;
  scene.step(selected.action);
  previous = before;
  current = observe();
  count++;
  updateMetrics();
  worker.postMessage({
    type: "error",
    version,
    observation: history(previous, current),
    prediction: selected.predicted,
  });
  const overlap = updateMetrics();
  successStreak = overlap >= 0.95 ? successStreak + 1 : 0;
  if (successStreak >= 3) {
    stop();
    status("Goal reached · ≥95% for 3 actions");
    $("stage-status").textContent = "Goal reached in real physics";
  } else if (count >= 100) {
    stop();
    status("Action budget reached · reset to try again");
    $("stage-status").textContent = "Experimental model · goal not reached";
  } else if (running) {
    timer = setTimeout(requestPlan, 100);
  } else status("Paused · inspect imagination or step again");
}
function receive(e) {
  const m = e.data;
  if (m.type === "ready") {
    ready = true;
    $("run").disabled = false;
    $("step").disabled = false;
    $("model-badge").textContent = m.label || "Experimental";
    $("model-note").textContent = m.note;
    if (m.benchmark)
      $("benchmark-note").textContent =
        `Experimental: ${m.benchmark.easySuccesses}/${m.benchmark.easyTrials} easy benchmark goals reached ≥95% alignment for 3 actions. Arbitrary goals can fail.`;
    status("Ready · image-conditioned MPC");
  } else if (m.type === "error" && m.version === version) {
    errors.push(m.value);
    if (errors.length > 60) errors.shift();
    $("error").textContent = m.value.toFixed(4) + " latent MSE";
    const c = $("errors").getContext("2d");
    c.clearRect(0, 0, 280, 40);
    c.beginPath();
    c.strokeStyle = "#9277bd";
    errors.forEach((v, i) => {
      const x = (i * 280) / 60,
        y = 38 - (32 * v) / Math.max(0.001, ...errors);
      i ? c.lineTo(x, y) : c.moveTo(x, y);
    });
    c.stroke();
  } else if (m.type === "plan" && m.version === version) {
    clearTimeout(timer);
    busy = false;
    plan = m;
    pending = m;
    $("cost").textContent = m.cost.toFixed(3);
    $("latency").innerHTML = Math.round(m.latency) + "<small> ms</small>";
    $("stage-status").textContent = "Violet ghosts: decoded neural predictions";
    if ($("preview").checked) {
      $("execute").hidden = false;
      status("Plan ready · inspect, then execute");
    } else execute();
  } else if (
    m.type === "failure" &&
    (m.version === undefined || m.version === version)
  ) {
    clearTimeout(timer);
    stop();
    invalidate();
    status(m.message);
    $("stage-status").textContent =
      "Planner unavailable · manual controls still work";
    $("model-badge").textContent = "Unavailable";
  }
}
function manual(a) {
  stop();
  invalidate();
  const before = current;
  scene.step(a);
  previous = before;
  current = observe();
  updateMetrics();
  status("Manual action · step or run to replan");
}
$("run").onclick = () => {
  if (pending) {
    running = true;
    execute();
  } else {
    running = true;
    requestPlan();
  }
  $("pause").disabled = false;
  $("run").disabled = true;
};
$("step").onclick = () => {
  stop();
  pending ? execute() : requestPlan();
};
$("execute").onclick = execute;
$("pause").onclick = () => {
  stop();
  const frozen = plan;
  invalidate();
  plan = frozen;
  status("Paused · showing the last neural plan");
};
$("reset").onclick = reset;
$("next").onclick = () => {
  seed++;
  reset();
};
$("difficulty").onchange = reset;
$("compute").onchange = () => {
  invalidate();
  if (running) requestPlan();
};
$("rotation").oninput = () => {
  invalidate();
  scene.goal.angle = (+$("rotation").value * Math.PI) / 180;
  $("angle").textContent = $("rotation").value + "°";
  successStreak = 0;
  updateMetrics();
  if (running) requestPlan();
};
let drag = null;
$("scene").onpointerdown = (e) => {
  const p = renderer.point(e),
    s = scene.state();
  if ($("disturb").checked)
    drag =
      Math.hypot(p.x - s.agent.x, p.y - s.agent.y) < 0.7 ? "agent" : "object";
  else if (Math.hypot(p.x - scene.goal.x, p.y - scene.goal.y) < 1.9)
    drag = "goal";
  if (drag) {
    invalidate();
    $("scene").setPointerCapture(e.pointerId);
    e.preventDefault();
  }
};
$("scene").onpointermove = (e) => {
  if (!drag) return;
  const p = renderer.point(e);
  if (drag === "goal") {
    scene.goal.x = clip(p.x, 1.6, 8.4);
    scene.goal.y = clip(p.y, 1.6, 8.4);
  } else {
    if (drag === "agent") {
      const a = scene.state().agent;
      scene.step([(p.x - a.x) / 0.48, (p.y - a.y) / 0.48]);
    } else scene.disturb(drag, p.x, p.y);
    current = observe();
    previous = current;
  }
  successStreak = 0;
  updateMetrics();
};
function release() {
  if (!drag) return;
  drag = null;
  current = observe();
  previous = current;
  status("Scene changed · ready to replan");
  if (running) requestPlan();
}
$("scene").onpointerup = release;
$("scene").onpointercancel = release;
window.addEventListener("keydown", (e) => {
  if (["INPUT", "SELECT"].includes(e.target.tagName)) return;
  const a = {
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
    ArrowUp: [0, -1],
    ArrowDown: [0, 1],
  }[e.key];
  if (a) {
    e.preventDefault();
    manual(a);
  }
});
reset();
function frame() {
  renderer.draw(scene.state(), scene.goal, plan, $("ghosts").checked);
  requestAnimationFrame(frame);
}
frame();
try {
  worker = new Worker(new URL("./planner.worker.js?v=2.2", import.meta.url));
  worker.onmessage = receive;
  worker.onerror = () => {
    stop();
    status("Model worker failed · manual controls available");
  };
  worker.postMessage({ type: "init" });
} catch (error) {
  status("Model initialization failed · " + error.message);
}
// Read-only diagnostics for reproducible browser evaluation. No action selection here.
window.tinyWorldPlanner = {
  get view() {
    return { ...renderer.transform };
  },
  get state() {
    return scene.state();
  },
  get goal() {
    return { ...scene.goal };
  },
  get snapshot() {
    return {
      ready,
      busy,
      running,
      count,
      version,
      coverage: coverage(scene.state().object, scene.goal),
      planCost: plan?.cost,
    };
  },
};
