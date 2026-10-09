import { Simulation } from "./simulation.js";
import { createView } from "./renderer.js";
const $ = (id) => document.getElementById(id),
  sim = new Simulation();
let view,
  disposed = false,
  fps = 0,
  frames = 0,
  renderStart = performance.now(),
  resetEpoch = 0;
const controls = ["start", "pause", "reset", "robot", "box", "task", "course"];
function settings() {
  for (const id of ["sx", "sy", "gx", "gy"])
    if (!$(id).checkValidity() || !Number.isFinite(+$(id).value)) throw Error("Use valid coordinates within the shown bounds.");
  return { task: $("task").value, start: [+$("sx").value, +$("sy").value], goal: [+$("gx").value, +$("gy").value] };
}
async function boundary() {
  sim.paused = true;
  while (sim.busy) await new Promise((r) => setTimeout(r, 10));
}
async function reset(run = false) {
  try {
    const epoch = ++resetEpoch,
      s = settings();
    await boundary();
    if (epoch !== resetEpoch) return;
    view?.dispose();
    sim.reset(s);
    view = createView($("scene"), sim);
    sim.paused = !run;
    sim.wallStart = run ? performance.now() : null;
    $("reference-mode").textContent = sim.referenceMode;
    $("pause").textContent = run ? "Pause" : "Resume";
    $("status").textContent = run ? "Policy running" : "Ready · choose a goal";
  } catch (e) {
    $("status").textContent = e.message;
  }
}
$("about").onclick = () => $("credits").showModal();
$("close").onclick = () => $("credits").close();
$("start").onclick = () => reset(true);
$("reset").onclick = () => reset(false);
$("task").onchange = () => reset(false);
$("pause").onclick = () => {
  if (sim.finished) return;
  sim.paused = !sim.paused;
  $("pause").textContent = sim.paused ? "Resume" : "Pause";
  $("status").textContent = sim.paused ? "Paused" : "Policy running";
};
$("course").onchange = () => {
  const c = sim.references.courses.find((c) => c.id === $("course").value);
  if (c) {
    ["sx", "sy", "gx", "gy"].forEach((id, i) => ($(id).value = [...c.start, ...c.goal][i]));
    reset(false);
  }
};
for (const id of ["sx", "sy", "gx", "gy"])
  $(id).oninput = () => {
    $("course").value = "custom";
    $("reference-mode").textContent = "Custom · experimental browser planner";
  };
$("robot").onclick = () => {
  sim.disturb();
  if (sim.paused) $("status").textContent = "Force queued · Resume to apply";
};
$("box").onclick = () => {
  sim.disturb(true);
  if (sim.paused) $("status").textContent = "Force queued · Resume to apply";
};
function render(t) {
  if (disposed) return;
  view?.update();
  frames++;
  if (t - renderStart > 1000) {
    fps = (frames * 1000) / (t - renderStart);
    frames = 0;
    renderStart = t;
  }
  if (sim.model) {
    const s = sim.stats;
    $("time").textContent = s.time.toFixed(1) + " s";
    $("error").textContent = `Box error ${s.error.toFixed(2)} m · ${
      s.height < 0.4 ? "Robot fell" : sim.finished ? (s.success ? "Destination reached" : "Destination missed") : "Live physics"
    }`;
    $("pace").textContent = `${s.inferenceMs.toFixed(1)} ms inference · ${fps.toFixed(0)} FPS · ${s.pace.toFixed(2)}× pace`;
    for (const id of ["pause", "robot", "box"]) $(id).disabled = sim.finished;
    if (sim.finished) {
      $("pause").textContent = "Finished";
      $("status").textContent = s.success ? "Task complete" : "Task ended · goal missed";
    }
  }
  requestAnimationFrame(render);
}
async function controlLoop() {
  while (!disposed) {
    const t = performance.now(),
      epoch = resetEpoch,
      running = !sim.paused && !sim.busy;
    if (running) {
      try {
        await sim.tick();
      } catch (e) {
        $("status").textContent = e.message;
      }
    }
    const delay = Math.max(1, 20 - (performance.now() - t));
    await new Promise((r) => setTimeout(r, delay));
    if (running && epoch === resetEpoch) sim.wallElapsed += performance.now() - t;
  }
}
async function boot() {
  try {
    await sim.init();
    await reset();
    controls.forEach((id) => ($(id).disabled = false));
    requestAnimationFrame(render);
    controlLoop();
    window.locoDiagnostics = () => ({
      ...sim.stats,
      ticks: sim.ticks,
      paused: sim.paused,
      busy: sim.busy,
      finished: sim.finished,
      task: sim.task,
      nframes: sim.policy.nframes,
    });
  } catch (e) {
    $("status").textContent = `Unable to load: ${e.message}`;
    console.error(e);
  }
}
boot();
window.addEventListener(
  "pagehide",
  () => {
    disposed = true;
    view?.dispose();
    sim.dispose();
  },
  { once: true }
);

window.addEventListener("pageshow", (event) => {
  if (event.persisted) location.reload();
});
