import fs from "node:fs";
import {
  createScene,
  coverage,
} from "../../../assets/interactive/tiny-world-planner/src/physics.js";
import { renderSensor } from "../../../assets/interactive/tiny-world-planner/src/raster.js";
import {
  masks,
  history,
} from "../../../assets/interactive/tiny-world-planner/src/observation.js";
import {
  CEM,
  CONFIGS,
} from "../../../assets/interactive/tiny-world-planner/src/planner.js";
import { loadModel } from "./runtime.mjs";
const model = await loadModel(),
  rows = [];
const experiments = [
  ["horizon1", 1, 32, true],
  ["horizon4", 4, 32, true],
  ["horizon8", 8, 32, true],
  ["candidates16", 6, 16, true],
  ["candidates64", 6, 64, true],
  ["candidates128", 6, 128, true],
  ["no-warm-start", 6, 32, false],
  ["warm-start", 6, 32, true],
];
for (const [name, horizon, candidates, warm] of experiments) {
  CONFIGS.ablation = { horizon, candidates, iterations: 3 };
  for (let i = 0; i < 10; i++) {
    const seed = 901000 + i,
      scene = createScene(seed, "easy"),
      planner = new CEM(model),
      read = () =>
        masks(renderSensor(scene.state().object, scene.state().agent));
    let current = read(),
      previous = current,
      success = false,
      streak = 0,
      ms = 0;
    const goal = await model.goal(masks(renderSensor(scene.goal, null)).object);
    for (let t = 0; t < 100; t++) {
      if (!warm) planner.reset();
      const plan = await planner.plan(
        await model.encode(history(previous, current)),
        goal,
        "ablation",
      );
      ms += plan.latency;
      scene.step(plan.action);
      previous = current;
      current = read();
      streak =
        coverage(scene.state().object, scene.goal) >= 0.95 ? streak + 1 : 0;
      if (streak >= 3) {
        success = true;
        break;
      }
    }
    rows.push({
      name,
      seed,
      horizon,
      candidates,
      warm,
      success,
      finalCoverage: coverage(scene.state().object, scene.goal),
      totalPlanMs: ms,
    });
  }
  console.log(
    name,
    rows
      .filter((x) => x.name === name)
      .reduce((a, b) => a + b.finalCoverage, 0) / 10,
  );
  fs.writeFileSync(
    "results/ablations.json",
    JSON.stringify(
      {
        backend:
          "Node ONNX Runtime Web WASM, single thread; development seeds only",
        rows,
      },
      null,
      2,
    ),
  );
}
