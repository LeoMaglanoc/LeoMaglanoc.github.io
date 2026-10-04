import { Policy } from "./policy.js";
import { Simulation } from "./simulation.js";
import { Runner } from "./runner.js";
import { Renderer } from "./renderer.js";
import { setupUI } from "./ui.js";

const errorElement = document.getElementById("error");
let failed = false;
function fail(error) {
  failed = true;
  console.error(error);
  errorElement.hidden = false;
  errorElement.textContent = `Could not run TinyDreamer: ${error.message}. Try reloading this page.`;
  document.getElementById("status").textContent = "Unable to load";
}

async function main() {
  const policy = new Policy();
  await policy.init();
  const sim = new Simulation(policy.metadata);
  await sim.init();
  const runner = new Runner(sim, policy);
  const renderer = new Renderer(document.getElementById("scene"));
  let accumulator = 0,
    last = null,
    busy = false;
  const reset = () => {
    runner.reset();
    accumulator = 0;
    renderer.render(runner);
  };
  const updateUI = setupUI(runner, reset);
  document.querySelectorAll("button, input").forEach((element) => {
    element.disabled = false;
  });
  window.tinyDreamer = { ready: true, runner, policy, sim, renderer, reset };
  updateUI();
  const frame = async (time) => {
    if (failed) return;
    if (last === null) last = time;
    const elapsed = Math.min(0.1, (time - last) / 1000);
    last = time;
    if (!runner.paused && !document.hidden)
      accumulator = Math.min(0.15, accumulator + elapsed);
    else accumulator = 0;
    if (
      !busy &&
      !runner.paused &&
      accumulator >= policy.metadata.policy_timestep
    ) {
      busy = true;
      accumulator -= policy.metadata.policy_timestep;
      runner
        .step()
        .catch(fail)
        .finally(() => {
          busy = false;
        });
    }
    renderer.render(runner);
    updateUI();
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
main().catch(fail);
