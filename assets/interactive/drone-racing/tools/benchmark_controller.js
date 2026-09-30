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
for (const kind of ["nominal", "impulse", "wind", "mass", "motor"]) {
  runner.reset(false);
  const samples = [];
  let disturbed = false;
  while (runner.time < trajectory.duration + 4) {
    if (!disturbed && runner.time >= 4) {
      if (kind !== "nominal") runner.disturb(kind);
      disturbed = true;
    }
    runner.step();
    if (runner.steps % 5 === 0)
      samples.push([+runner.time.toFixed(3), ...Array.from(sim.state.p, (x) => +x.toFixed(5)), ...Array.from(sim.state.q, (x) => +x.toFixed(6))]);
  }
  results[kind] = runner.metrics();
  console.log(kind, JSON.stringify(results[kind]));
  assert.equal(runner.race.gate, course.gates.length, `${kind} missed gate ${runner.race.gate + 1}`);
  assert.equal(runner.resets, 0);
  assert.equal(runner.race.collisions, 0, `${kind} collided`);
  assert.ok(runner.maxError < 1, `${kind} excessive tracking error`);
  assert.ok(Math.hypot(...trajectory.sample(trajectory.duration + 4).p.map((x, i) => x - sim.state.p[i])) < 0.25, `${kind} did not settle`);
  if (kind === "nominal")
    await writeFile(
      new URL("../trajectories/ghost_v1.json", import.meta.url),
      JSON.stringify({ source: "MuJoCo WASM + tracking MPC nominal rollout", dt: 0.02, finishTime: runner.race.finishTime, samples }) + "\n"
    );
}
await writeFile(new URL("../tests/benchmark-results.json", import.meta.url), JSON.stringify(results, null, 2) + "\n");
