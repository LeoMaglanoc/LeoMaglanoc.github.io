import { SortingSimulation } from "./simulation.js";
import { SortingTask } from "./task.js";
import { SortingRenderer } from "./renderer.js";
import { C } from "./config.js";
const $ = (id) => document.getElementById(id);
let paused = false,
  debug = false,
  task,
  sim,
  renderer,
  accumulator = 0,
  last = 0;
const names = {
  SETTLE: "Getting ready",
  SELECT: "Choosing a box",
  TO_INPUT: "Docking at input",
  PREGRASP: "Reaching above",
  DESCEND: "Approaching the box",
  CLOSE: "Closing the fingers",
  TEST_LIFT: "Testing the grasp",
  VERIFY_GRASP: "Checking the lift",
  RETRACT: "Ready to carry",
  TO_OUTPUT: "On the move",
  ABOVE_BIN: "Reaching over the bin",
  LOWER: "Lowering the box",
  OPEN: "Letting go",
  VERIFY_PLACE: "Checking the placement",
  CLEAR_BIN: "Clearing the bin",
  STOW: "Tucking the arm",
  RETURN: "Returning for more",
  RECOVER: "Retreating & retrying",
};
const pick = ["SELECT", "TO_INPUT", "PREGRASP", "DESCEND", "CLOSE", "TEST_LIFT", "VERIFY_GRASP"],
  carry = ["RETRACT", "TO_OUTPUT"],
  place = ["ABOVE_BIN", "LOWER", "OPEN", "VERIFY_PLACE", "CLEAR_BIN", "STOW"];
function updateUI() {
  const x = task.snapshot();
  $("state").textContent = paused ? "Shift paused" : names[x.state] ?? x.state;
  $("target").textContent = x.color ? `${x.color.toUpperCase()} BOX → ${x.color.toUpperCase()} BIN` : "Pick → carry → sort → repeat";
  for (const name of ["sorted", "blue", "red", "retries"]) $(name).textContent = x.stats[name];
  $("live-label").textContent = paused ? "PAUSED" : "AUTONOMOUS / LOCAL PHYSICS";
  const phase = pick.includes(x.state) ? "pick" : carry.includes(x.state) ? "carry" : place.includes(x.state) ? "place" : null;
  document.querySelectorAll("[data-phase]").forEach((el) => el.classList.toggle("active", el.dataset.phase === phase));
  $("debug-info").hidden = !debug;
  if (debug)
    $("debug-info").textContent = `${x.state} / ${x.time.toFixed(1)}s\nBase ${x.base.map((v) => v.toFixed(2)).join(" ")}\nEE ${x.tip
      .map((v) => v.toFixed(2))
      .join(" ")}\nRetries ${x.stats.retries} · slips ${x.stats.drops}\n${x.lastError}`;
}
$("about").onclick = () => {
  const open = $("explanation").hidden;
  $("explanation").hidden = !open;
  $("about").setAttribute("aria-expanded", String(open));
};
$("close-about").onclick = () => {
  $("explanation").hidden = true;
  $("about").setAttribute("aria-expanded", "false");
  $("about").focus();
};
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    $("explanation").hidden = true;
    $("about").setAttribute("aria-expanded", "false");
  }
});
$("pause").onclick = () => {
  paused = !paused;
  accumulator = 0;
  $("pause").innerHTML = paused ? "Resume <span>▶</span>" : "Pause <span>Ⅱ</span>";
  updateUI();
};
$("reset").onclick = () => {
  task.reset();
  accumulator = 0;
  updateUI();
};
$("debug").onclick = () => {
  debug = !debug;
  $("debug").setAttribute("aria-pressed", String(debug));
  updateUI();
};
$("camera").onclick = () => renderer.homeCamera();
$("fullscreen").onclick = async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
    else {
      $("fullscreen").textContent = "Unavailable";
      setTimeout(() => ($("fullscreen").textContent = "Full screen"), 1600);
    }
  } catch (e) {
    $("fullscreen").textContent = "Unavailable";
  }
};
document.addEventListener("visibilitychange", () => {
  last = 0;
  accumulator = 0;
});
async function start() {
  try {
    sim = new SortingSimulation();
    await sim.init((p) => {
      $("progress").style.width = `${Math.round(p * 100)}%`;
      $("load-text").textContent = `Loading TIAGo · ${Math.round(p * 100)}%`;
    });
    task = new SortingTask(sim);
    renderer = new SortingRenderer($("simulation"));
    renderer.buildModel(sim.model);
    $("loading").hidden = true;
    $("pause").disabled = false;
    $("reset").disabled = false;
    // Same physics/controller entry point used by the accelerated regression harness.
    window.sorting = {
      sim,
      task,
      renderer,
      get paused() {
        return paused;
      },
      set paused(v) {
        paused = Boolean(v);
        accumulator = 0;
      },
      snapshot: () => task.snapshot(),
      advance: (n) => {
        for (let i = 0; i < n; i++) task.step();
        renderer.lastRender = 0;
        renderer.update(sim.data, task, debug);
        updateUI();
      },
    };
    let frames = 0,
      frameStart = performance.now(),
      slowSeconds = 0;
    window.sorting.metrics = { fps: 0, physicsMs: 0, slowFrames: 0 };
    function frame(now) {
      requestAnimationFrame(frame);
      const delta = last ? Math.min((now - last) / 1000, 0.1) : 0;
      last = now;
      const begin = performance.now();
      if (!paused && !document.hidden) {
        accumulator += delta;
        let steps = 0;
        while (accumulator >= C.dt && steps < 40) {
          task.step();
          accumulator -= C.dt;
          steps++;
        }
        if (accumulator > 0.16) {
          accumulator = 0.04;
          window.sorting.metrics.slowFrames++;
        }
      }
      window.sorting.metrics.physicsMs = 0.95 * window.sorting.metrics.physicsMs + 0.05 * (performance.now() - begin);
      renderer.update(sim.data, task, debug);
      if (++frames % 8 === 0) updateUI();
      if (now - frameStart >= 1000) {
        window.sorting.metrics.fps = (frames * 1000) / (now - frameStart);
        slowSeconds = window.sorting.metrics.fps < 35 ? slowSeconds + 1 : 0;
        if (slowSeconds >= 3) renderer.reduceQuality();
        frames = 0;
        frameStart = now;
      }
    }
    updateUI();
    requestAnimationFrame(frame);
  } catch (e) {
    console.error(e);
    $("load-text").textContent = `The lab could not start: ${e.message}. Reload to try again.`;
  }
}
start();
