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
import { CEM } from "../../../assets/interactive/tiny-world-planner/src/planner.js";
import { loadModel } from "./runtime.mjs";
const model = await loadModel(),
  scene = createScene(901500, "easy"),
  read = () => masks(renderSensor(scene.state().object, scene.state().agent));
let current = read(),
  previous = current;
const goal = await model.goal(masks(renderSensor(scene.goal, null)).object),
  initial = await model.encode(history(previous, current)),
  plan = await new CEM(model).plan(initial, goal, "standard");
const distance = (z) =>
  z.slice(0, 16).reduce((a, b, i) => a + (b - goal[i]) ** 2, 0) / 16;
const rows = [];
for (let k = 0; k < plan.latents.length; k++) {
  const action = plan.sequence.slice(k * 2, k * 2 + 2);
  scene.step(action);
  previous = current;
  current = read();
  const actual = await model.encode(history(previous, current));
  rows.push({
    k,
    action,
    predictedCost: distance(plan.latents[k]),
    actualCost: distance(actual),
    coverage: coverage(scene.state().object, scene.goal),
    contact: scene.state().lastActionContact,
  });
}
const result = { initialCost: distance(initial), rows };
console.log(JSON.stringify(result, null, 2));
fs.writeFileSync("results/model-trace.json", JSON.stringify(result, null, 2));
