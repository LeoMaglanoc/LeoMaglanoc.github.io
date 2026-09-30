import { Simulation } from "./simulation.js";
import { sceneXml } from "./course.js";
import { Trajectory } from "./trajectory.js";
import { Runner } from "./runner.js";
import { FlightInput } from "./input.js";
import { FlightRenderer } from "./renderer.js";
import { FlightUI } from "./ui.js";
const ui = new FlightUI();
document.querySelectorAll("button").forEach((el) => (el.disabled = true));
async function fetchAsset(path, json = true) {
  const response = await fetch(new URL(path, import.meta.url));
  if (!response.ok) throw Error(`Could not load ${path}: HTTP ${response.status}`);
  return json ? response.json() : response.text();
}
async function start() {
  const [course, trajectoryData, ghost, droneXml] = await Promise.all([
    fetchAsset("../course.json"),
    fetchAsset("../trajectories/race_v1.json"),
    fetchAsset("../trajectories/ghost_v1.json"),
    fetchAsset("../models/crazyflie.xml", false),
  ]);
  const trajectory = new Trajectory(trajectoryData),
    sim = await new Simulation().init(sceneXml(droneXml, course));
  const runner = new Runner(sim, trajectory, course),
    input = new FlightInput(),
    renderer = new FlightRenderer(document.getElementById("world"), course, trajectory);
  let paused = false,
    previous = null,
    accumulator = 0,
    frames = 0,
    lastStats = performance.now(),
    lastSim = 0,
    physicsTotal = 0,
    renderTotal = 0;
  const stats = { fps: 0, ratio: 0, physics: 0, render: 0 };
  const reset = () => {
    runner.reset();
    input.reset();
    renderer.reset();
    accumulator = 0;
    previous = null;
    lastSim = 0;
    lastStats = performance.now();
    frames = 0;
    physicsTotal = 0;
    renderTotal = 0;
  };
  const pause = (value) => {
    paused = value;
    input.reset();
    accumulator = 0;
    previous = null;
    document.getElementById("pause").textContent = paused ? "Resume" : "Pause";
  };
  document.querySelectorAll("[data-mode]").forEach((el) =>
    el.addEventListener("click", () => {
      runner.mode = el.dataset.mode;
      document.querySelectorAll("[data-mode]").forEach((button) => button.setAttribute("aria-pressed", button === el));
      document.body.classList.toggle("manual", runner.mode !== "AUTOPILOT");
      reset();
      pause(false);
    })
  );
  document.getElementById("reset").addEventListener("click", reset);
  document.getElementById("pause").addEventListener("click", () => pause(!paused));
  document.getElementById("camera").addEventListener("click", () => {
    renderer.cameraMode = renderer.cameraMode === "CHASE" ? "FPV" : "CHASE";
    document.getElementById("camera").textContent = renderer.cameraMode === "CHASE" ? "Chase → FPV" : "FPV → Chase";
    renderer.initialized = false;
  });
  document.querySelectorAll("[data-disturb]").forEach((el) => el.addEventListener("click", () => runner.disturb(el.dataset.disturb)));
  document.getElementById("paths").addEventListener("change", (e) => renderer.paths(e.target.checked));
  window.addEventListener("keydown", (e) => {
    if (e.repeat || ["INPUT", "TEXTAREA", "SELECT", "SUMMARY"].includes(e.target.tagName)) return;
    if (e.code === "Space") {
      e.preventDefault();
      pause(!paused);
    }
    if (e.code === "Backspace") {
      e.preventDefault();
      reset();
    }
  });
  window.addEventListener("blur", () => pause(true));
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) pause(true);
  });
  // Explicit inspection hook for deterministic real-WASM browser tests.
  window.drone = { runner, renderer, input, stats, ghost, pause, reset, ready: true };
  ui.ready();
  function frame(time) {
    try {
      const elapsed = previous === null ? 0 : Math.max(0, (time - previous) / 1000);
      previous = time;
      const pStart = performance.now();
      if (!paused) {
        accumulator = Math.min(0.08, accumulator + Math.min(0.08, elapsed));
        let steps = 0;
        while (accumulator >= sim.dt && steps < 20) {
          runner.step(input.update());
          accumulator -= sim.dt;
          steps++;
        }
      }
      physicsTotal += performance.now() - pStart;
      const rStart = performance.now();
      renderer.render(runner, ghost);
      renderTotal += performance.now() - rStart;
      frames++;
      if (time - lastStats >= 1000) {
        const wall = (time - lastStats) / 1000;
        stats.fps = frames / wall;
        stats.ratio = (runner.time - lastSim) / wall;
        stats.physics = physicsTotal / frames;
        stats.render = renderTotal / frames;
        renderer.adapt(stats.fps);
        lastStats = time;
        lastSim = runner.time;
        frames = 0;
        physicsTotal = 0;
        renderTotal = 0;
      }
      ui.update(runner, stats, ghost, paused, time);
      requestAnimationFrame(frame);
    } catch (error) {
      pause(true);
      ui.error(error);
    }
  }
  requestAnimationFrame(frame);
}
start().catch((error) => ui.error(error));
