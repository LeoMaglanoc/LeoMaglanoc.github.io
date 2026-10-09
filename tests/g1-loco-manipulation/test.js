import { Simulation } from "/assets/interactive/g1-loco-manipulation/src/simulation.js";
const output = document.getElementById("result");
function maxerr(a, b) {
  if (a.length !== b.length) throw Error(`Length mismatch ${a.length}/${b.length}`);
  return a.reduce((e, v, i) => Math.max(e, Math.abs(v - b[i])), 0);
}
const mapping = {
  refLeftWristPos: "ref_left_wrist_pos",
  refLeftWristQuat: "ref_left_wrist_quat",
  refRightWristPos: "ref_right_wrist_pos",
  refRightWristQuat: "ref_right_wrist_quat",
  refTorsoPos: "ref_torso_future_pos",
  refTorsoQuat: "ref_torso_future_quat",
  refLeftAnklePos: "ref_left_ankle_future_pos",
  refLeftAnkleQuat: "ref_left_ankle_future_quat",
  refRightAnklePos: "ref_right_ankle_future_pos",
  refRightAnkleQuat: "ref_right_ankle_future_quat",
  refContact: "ref_contact",
};
document.getElementById("run").onclick = async () => {
  const sim = new Simulation(),
    report = {};
  document.getElementById("run").disabled = true;
  try {
    await sim.init();
    for (const task of ["carrybox", "pushbox"]) {
      output.textContent = "Checking " + task;
      const fixture = await (await fetch("/projects/g1-loco-manipulation/fixture-" + task + ".json")).json();
      sim.reset({ task, start: [1, 0], goal: [2, 0.5] });
      // Frozen native references isolate observation and ONNX parity from planner differences.
      sim.policy._makeRefArrays(fixture.refs.ref_contact.length);
      for (const [js, py] of Object.entries(mapping)) sim.policy[js] = fixture.refs[py].map((x) => Float32Array.from(x));
      let observationError = 0,
        actionError = 0,
        physicsError = 0,
        rawInferenceError = 0;
      for (const [index, frame] of fixture.frames.entries()) {
        sim.mj.mj_resetData(sim.model, sim.data);
        sim.data.qpos.set(frame.qpos.slice(0, sim.model.nq));
        sim.data.qacc_warmstart.set(frame.warmstart);
        sim.data.qvel.set(frame.qvel.slice(0, sim.model.nv));
        sim.data.mocap_pos.set(frame.mocap.slice(0, 2).flat());
        sim.mj.mj_forward(sim.model, sim.data);
        const pose = sim.policy.readBodyPose;
        sim.policy.readBodyPose = (id) =>
          id === sim.bodyIds.box ? { pos: Float32Array.from(frame.objectPos), quat: Float32Array.from(frame.objectQuat) } : pose(id);
        await sim.policy.step(sim.state());
        sim.policy.readBodyPose = pose;

        observationError = Math.max(observationError, maxerr(Array.from(sim.policy.inputObs), frame.obs));
        actionError = Math.max(actionError, maxerr(Array.from(sim.policy.action), frame.actions));
        const raw = await sim.policy._runRaw(Float32Array.from(frame.obs), 0);
        rawInferenceError = Math.max(rawInferenceError, maxerr(Array.from(raw.actions.data), frame.actions));
        for (const tensor of Object.values(raw)) tensor.dispose();
        if (index + 1 < fixture.frames.length) {
          const physicsTarget = sim.config.lab2mj.map((i) => frame.actions[i] * sim.config.action_scale_lab[i] + sim.config.default_angles_lab[i]);
          sim.data.mocap_pos.set(frame.mocap.slice(0, 2).flat());
          for (let step = 0; step < 4; step++) {
            for (let i = 0; i < 29; i++) {
              const torque =
                sim.config.stiffness[i] * (physicsTarget[i] - sim.data.qpos[sim.qa[i]]) - sim.config.damping[i] * sim.data.qvel[sim.va[i]];
              sim.data.ctrl[sim.ca[i]] = Math.max(-sim.config.torque_limits[i], Math.min(sim.config.torque_limits[i], torque));
            }
            sim.mj.mj_step(sim.model, sim.data);
          }
          const error = maxerr(Array.from(sim.data.qpos), fixture.frames[index + 1].qpos);
          physicsError = Math.max(physicsError, error);
        }
      }
      report[task] = {
        observationError,
        actionError,
        rawInferenceError,
        physicsError,
        parity: observationError < 2e-5 && actionError < 2e-4 && rawInferenceError < 2e-4 && physicsError < 2e-4,
      };
      if (!report[task].parity) throw Error("Parity failed: " + JSON.stringify(report));
      report[task].courses = [];
      sim.reset({ task, start: [1, 0], goal: [2, 0.5] });
      const before = Array.from(sim.data.qpos);
      await sim.tick();
      report[task].pauseStable = sim.ticks === 0 && maxerr(before, Array.from(sim.data.qpos)) === 0;
      sim.paused = false;
      for (let i = 0; i < 10; i++) await sim.tick();
      const baseline = Array.from(sim.data.qpos);
      sim.reset({ task, start: [1, 0], goal: [2, 0.5] });
      sim.paused = false;
      sim.disturb();
      for (let i = 0; i < 10; i++) await sim.tick();
      report[task].robotForceDelta = maxerr(baseline, Array.from(sim.data.qpos));
      sim.reset({ task, start: [1, 0], goal: [2, 0.5] });
      sim.paused = false;
      sim.disturb(true);
      for (let i = 0; i < 10; i++) await sim.tick();
      report[task].boxForceDelta = maxerr(baseline, Array.from(sim.data.qpos));
      for (const course of sim.references.courses) {
        sim.reset({ task, start: course.start, goal: course.goal });
        sim.paused = false;
        const timings = [];
        let endpoint;
        let peakBoxZ = 0;
        const started = performance.now();
        for (let i = 0; i < sim.policy.nframes; i++) {
          await sim.tick();
          timings.push({ inference: sim.inferenceMs, physics: sim.physicsMs });
          if (sim.ticks === sim.policy.nframes) endpoint = sim.stats;
          peakBoxZ = Math.max(peakBoxZ, sim.stats.box[2]);
          if (i % 100 === 0) output.textContent = JSON.stringify(report, null, 2) + "\nRollout " + task + " " + i;
        }
        report[task].courses.push({
          ...sim.stats,
          endpoint,
          meanInferenceMs: timings.reduce((n, t) => n + t.inference, 0) / timings.length,
          p95InferenceMs: timings.map((t) => t.inference).sort((a, b) => a - b)[Math.floor(timings.length * 0.95)],
          meanPhysicsMs: timings.reduce((n, t) => n + t.physics, 0) / timings.length,
          course: course.id,
          ticks: sim.ticks,
          peakBoxZ,
          wallSeconds: (performance.now() - started) / 1000,
          success:
            sim.stats.error < 0.2 &&
            sim.stats.height > 0.4 &&
            (task === "carrybox" ? Math.abs(sim.stats.box[2] - 0.55) < 0.06 && peakBoxZ > 0.7 : sim.stats.box[2] > 0.2 && sim.stats.box[2] < 0.35),
        });
      }
    }
    report.pass = Object.values(report).every(
      (x) => x.parity && x.pauseStable && x.robotForceDelta > 1e-6 && x.boxForceDelta > 1e-6 && x.courses.every((c) => c.success)
    );
    report.viewport = { width: window.innerWidth, height: window.innerHeight };
    output.textContent = JSON.stringify(report, null, 2);
    window.regressionReport = report;
  } catch (e) {
    output.textContent = "FAIL " + e.stack + "\n" + JSON.stringify(report, null, 2);
  } finally {
    await sim.dispose();
    document.getElementById("run").disabled = false;
  }
};
