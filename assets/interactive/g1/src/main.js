import { CommandManager } from "./input.js";
import { BrowserPolicy } from "./policy.js";
import { G1Renderer } from "./renderer.js";
import { G1Simulation } from "./simulation.js";
import { G1UI } from "./ui.js";

const ui = new G1UI();
const renderer = new G1Renderer(document.getElementById("g1-canvas"));
const commandManager = new CommandManager();
const policy = new BrowserPolicy(new URL("../models/policy.onnx", import.meta.url));
let simulation;

function update(data, stats, error) {
  if (error) ui.showError(error);
  if (!simulation) return;
  renderer.update(data);
  ui.update(commandManager.current, stats);
}

async function start() {
  try {
    ui.setLoading("Loading MuJoCo and the locomotion policy…");
    await policy.load();
    simulation = new G1Simulation(policy, commandManager, update);
    await simulation.init();
    renderer.buildModel(simulation.model);
    commandManager.onChange = () => ui.update(commandManager.current, simulation.stats);
    ui.ready();
    ui.resetButton.addEventListener("click", () => {
      commandManager.reset();
      simulation.reset();
    });
    const pushStrength = document.getElementById("g1-push-strength");
    const pushStrengthValue = document.getElementById("g1-push-strength-value");
    pushStrength.addEventListener("input", () => { pushStrengthValue.textContent = pushStrength.value; });
    ui.pauseButton.addEventListener("click", () => {
      simulation.setPaused(!simulation.paused);
      ui.setPaused(simulation.paused);
    });
    ui.pushLeftButton.addEventListener("click", () => simulation.applyPush(-1, Number(document.getElementById("g1-push-strength").value)));
    ui.pushRightButton.addEventListener("click", () => simulation.applyPush(1, Number(document.getElementById("g1-push-strength").value)));
    document.querySelectorAll("[data-command-key]").forEach((button) => commandManager.bindButton(button, button.dataset.commandKey));
    window.addEventListener("keydown", (event) => {
      if (event.code === "Space") {
        event.preventDefault();
        simulation.setPaused(!simulation.paused);
        ui.setPaused(simulation.paused);
      }
      if (event.code === "Backspace") {
        event.preventDefault();
        commandManager.reset();
        simulation.reset();
      }
    });
    renderer.update(simulation.data);
    requestAnimationFrame(loop);
  } catch (error) {
    ui.showError(error);
  }
}

function loop(time) {
  simulation.advance(time);
  requestAnimationFrame(loop);
}

start();
