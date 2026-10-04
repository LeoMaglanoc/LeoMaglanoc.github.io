import { readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { Simulation } from "../src/simulation.js";
import { sceneXml } from "../src/course.js";
import { Trajectory } from "../src/trajectory.js";
import { Runner } from "../src/runner.js";
const read = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
const course = await read("../course.json"),
  trajectory = new Trajectory(await read("../trajectories/race_v1.json"));
const xml = sceneXml(await readFile(new URL("../models/fpv.xml", import.meta.url), "utf8"), course);
const sim = await new Simulation().init(xml),
  runner = new Runner(sim, trajectory, course),
  results = {};
for (const kind of ["nominal", "left", "right", "front", "back", "mass", "motor"]) {
  runner.reset(false);
  const samples = [],
    laps = [];
  let disturbed = false,
    lapError = 0,
    lapSquared = 0,
    lapSteps = 0;
  const horizon = trajectory.duration * (kind === "nominal" ? 21 : 4) + 1;
  while (runner.time < horizon) {
    if (!disturbed && runner.time >= trajectory.duration + 4) {
      if (kind !== "nominal") runner.disturb(kind);
      disturbed = true;
    }
    const lap = runner.race.lap;
    runner.step();
    const ref = trajectory.sample(runner.time + course.referenceOffset);
    const error = Math.hypot(...ref.p.map((x, i) => x - sim.state.p[i]));
    lapError = Math.max(lapError, error);
    lapSquared += error * error;
    lapSteps++;
    if (runner.race.lap !== lap) {
      laps.push({ ...runner.race.laps.at(-1), maxTrackingError: lapError, rmsTrackingError: Math.sqrt(lapSquared / lapSteps) });
      lapError = 0;
      lapSquared = 0;
      lapSteps = 0;
    }
    if (kind === "nominal" && runner.time >= 2 * trajectory.duration && runner.time <= 3 * trajectory.duration && runner.steps % 5 === 0)
      samples.push([+(runner.time - 2 * trajectory.duration).toFixed(5), ...Array.from(sim.state.p), ...Array.from(sim.state.q)]);
  }
  results[kind] = { ...runner.metrics(), laps };
  console.log(kind, JSON.stringify({ ...runner.metrics(), completedLaps: laps.length }));
  assert.ok(laps.length >= (kind === "nominal" ? 20 : 3), `${kind} missed ordered laps`);
  assert.equal(runner.resets, 0);
  assert.equal(runner.race.collisions, 0, `${kind} collided`);
  assert.ok(runner.maxError < 1.5, `${kind} excessive tracking error`);
  assert.ok(laps.at(-1).maxTrackingError < 0.4, `${kind} did not recover`);
  if (kind === "nominal") {
    assert.ok(laps.at(-1).rmsTrackingError <= laps[1].rmsTrackingError + 0.01, "error grew across laps");
    await writeFile(
      new URL("../trajectories/ghost_v1.json", import.meta.url),
      JSON.stringify({ source: "One steady MuJoCo/MPC lap", dt: 0.02, duration: trajectory.duration, finishTime: laps.at(-1).time, samples }) + "\n"
    );
  }
}
await writeFile(new URL("../tests/benchmark-results.json", import.meta.url), JSON.stringify(results, null, 2) + "\n");
