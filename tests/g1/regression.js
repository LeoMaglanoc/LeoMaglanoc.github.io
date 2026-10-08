import { BrowserPolicy } from "../../assets/interactive/g1/src/policy.js";
import { buildObservation } from "../../assets/interactive/g1/src/observations.js";
import { desiredJointPositions } from "../../assets/interactive/g1/src/controller.js";
import { G1Simulation } from "../../assets/interactive/g1/src/simulation.js";
const output = document.querySelector("#output");
document.querySelector("#run").onclick = async () => {
  document.querySelector("#run").disabled = true;
  output.textContent = "Running…";
  let simulation;
  try {
    const policy = new BrowserPolicy(new URL("../../assets/interactive/g1/models/policy.onnx", import.meta.url));
    await policy.load();
    const reference = await (await fetch("../../assets/interactive/g1/reference_trace.json")).json();
    let maxObservation = 0,
      maxAction = 0,
      maxTarget = 0;
    const error = (a, b) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));
    for (const trace of reference.traces) {
      const data = {
        qpos: Float64Array.from([0, 0, 0, ...trace.quat, ...trace.qj]),
        qvel: Float64Array.from([0, 0, 0, ...trace.omega, ...trace.dqj]),
      };
      const obs = buildObservation(data, [0, 0, 0], trace.obs.slice(33, 45), trace.step);
      maxObservation = Math.max(maxObservation, error(Array.from(obs), trace.obs));
      const action = await policy.act(Float32Array.from(trace.obs));
      maxAction = Math.max(maxAction, error(Array.from(action), trace.action));
      maxTarget = Math.max(maxTarget, error(Array.from(desiredJointPositions(trace.action)), trace.target_q));
    }
    if (maxObservation > 2e-6 || maxAction > 1e-5 || maxTarget > 1e-6)
      throw Error(`Native trace mismatch: ${maxObservation}, ${maxAction}, ${maxTarget}`);
    const report = { nativeTraces: reference.traces.length, maxObservation, maxAction, maxTarget };
    policy.reset();
    let command = [0, 0, 0];
    simulation = new G1Simulation(policy, { update: () => command }, null);
    await simulation.init();
    const advance = async (steps) => {
      for (let i = 0; i < steps; i++) {
        simulation.stepPhysics();
        while (simulation.inferenceBusy) await new Promise((resolve) => setTimeout(resolve, 0));
        if (!Array.from(simulation.data.qpos).every(Number.isFinite) || simulation.data.qpos[2] < 0.4) throw Error("G1 fell or became non-finite");
      }
    };
    await advance(1000);
    report.standingHeight = simulation.data.qpos[2];
    const start = Array.from(simulation.data.qpos.slice(0, 2));
    command = [0.4, 0, 0];
    await advance(1500);
    report.walkDistance = Math.hypot(simulation.data.qpos[0] - start[0], simulation.data.qpos[1] - start[1]);
    if (report.walkDistance < 0.2) throw Error("Command did not produce walking");
    simulation.reset();
    report.resetTime = simulation.stepCount;
    if (!policy.hidden.every((v) => v === 0) || !policy.cell.every((v) => v === 0)) throw Error("Reset retained recurrent state");
    await advance(5000);
    report.afterResetSeconds = simulation.stats.walkTime;
    report.afterResetHeight = simulation.data.qpos[2];
    report.result = "PASS";
    output.textContent = JSON.stringify(report, null, 2);
  } catch (e) {
    output.textContent = "FAIL: " + e.stack;
    console.error(e);
  } finally {
    simulation?.data?.delete();
    simulation?.model?.delete();
    document.querySelector("#run").disabled = false;
  }
};
